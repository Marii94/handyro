const express = require('express');
const router = express.Router();
const db = require('../db').db;
const { auth } = require('../middleware/auth');

function filterPhone(text) {
  return text.replace(/(\+4|0)(7\d{8}|\d{8,9})/g,'[număr blocat]').replace(/\b07\d{2}[\s.-]?\d{3}[\s.-]?\d{3}\b/g,'[număr blocat]');
}

router.get('/conversations', auth, async (req, res) => {
  try {
    let convs = [];
    if (req.user.role === 'client') convs = await db.conversations.find({ client_id: req.user.id });
    else if (req.user.role === 'meserias') convs = await db.conversations.find({ worker_id: req.user.id });
    else convs = await db.conversations.find({});

    convs = await Promise.all(convs.map(async c => {
      const job = await db.jobs.findOne({ _id: c.job_id });
      const client = await db.users.findOne({ _id: c.client_id });
      const worker = await db.users.findOne({ _id: c.worker_id });
      const msgs = await db.messages.find({ conversation_id: c._id });
      msgs.sort((a,b) => new Date(a.created_at)-new Date(b.created_at));
      const last = msgs[msgs.length-1];
      const unread = msgs.filter(m => m.sender_id !== req.user.id && !m.is_read).length;
      return { ...c, category: job?.category, client_name: client?.name, worker_name: worker?.name, last_message: last?.content, unread };
    }));
    res.json(convs);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/:convId', auth, async (req, res) => {
  try {
    const conv = await db.conversations.findOne({ _id: req.params.convId });
    if (!conv) return res.status(404).json({ error: 'Conversație negăsită' });
    const ok = conv.client_id===req.user.id || conv.worker_id===req.user.id || req.user.role==='admin';
    if (!ok) return res.status(403).json({ error: 'Acces interzis' });
    await db.messages.update({ conversation_id: req.params.convId, sender_id: { $ne: req.user.id } }, { $set: { is_read: true } }, { multi: true });
    const msgs = await db.messages.find({ conversation_id: req.params.convId });
    msgs.sort((a,b) => new Date(a.created_at)-new Date(b.created_at));
    const withNames = await Promise.all(msgs.map(async m => {
      const u = await db.users.findOne({ _id: m.sender_id });
      return { ...m, sender_name: u?.name };
    }));
    res.json(withNames);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/:convId', auth, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Mesaj gol' });
    const conv = await db.conversations.findOne({ _id: req.params.convId });
    if (!conv) return res.status(404).json({ error: 'Conversație negăsită' });
    const ok = conv.client_id===req.user.id || conv.worker_id===req.user.id;
    if (!ok) return res.status(403).json({ error: 'Acces interzis' });
    const safe = filterPhone(content.trim());
    const msg = await db.messages.insert({ conversation_id: req.params.convId, sender_id: req.user.id, content: safe, is_read: false, created_at: new Date().toISOString() });
    const u = await db.users.findOne({ _id: req.user.id });
    res.status(201).json({ ...msg, sender_name: u?.name, was_filtered: safe !== content.trim() });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
