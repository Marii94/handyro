const express = require('express');
const router = express.Router();
const { User, Conversation, Message } = require('../db');
const { auth } = require('../middleware/auth');

function filterPhone(text) {
  return text.replace(/(\+4|0)(7\d{8}|\d{8,9})/g,'[număr blocat]').replace(/\b07\d{2}[\s.-]?\d{3}[\s.-]?\d{3}\b/g,'[număr blocat]');
}

router.get('/conversations', auth, async (req, res) => {
  try {
    let convs;
    if (req.user.role === 'client') convs = await Conversation.find({ client_id: req.user.id });
    else if (req.user.role === 'meserias') convs = await Conversation.find({ worker_id: req.user.id });
    else convs = await Conversation.find({});
    const result = await Promise.all(convs.map(async c => {
      const { Job } = require('../db');
      const job = await Job.findById(c.job_id);
      const client = await User.findById(c.client_id);
      const worker = await User.findById(c.worker_id);
      const msgs = await Message.find({ conversation_id: c._id }).sort({ createdAt: 1 });
      const last = msgs[msgs.length-1];
      const unread = msgs.filter(m => String(m.sender_id) !== String(req.user.id) && !m.is_read).length;
      return { ...c.toObject(), category: job?.category, client_name: client?.name, worker_name: worker?.name, last_message: last?.content, unread };
    }));
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/:convId', auth, async (req, res) => {
  try {
    const conv = await Conversation.findById(req.params.convId);
    if (!conv) return res.status(404).json({ error: 'Conversație negăsită' });
    const ok = String(conv.client_id)===String(req.user.id) || String(conv.worker_id)===String(req.user.id) || req.user.role==='admin';
    if (!ok) return res.status(403).json({ error: 'Acces interzis' });
    await Message.updateMany({ conversation_id: req.params.convId, sender_id: { $ne: req.user.id } }, { is_read: true });
    const msgs = await Message.find({ conversation_id: req.params.convId }).sort({ createdAt: 1 });
    const result = await Promise.all(msgs.map(async m => {
      const u = await User.findById(m.sender_id);
      return { ...m.toObject(), sender_name: u?.name };
    }));
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/:convId', auth, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Mesaj gol' });
    const conv = await Conversation.findById(req.params.convId);
    if (!conv) return res.status(404).json({ error: 'Conversație negăsită' });
    const ok = String(conv.client_id)===String(req.user.id) || String(conv.worker_id)===String(req.user.id);
    if (!ok) return res.status(403).json({ error: 'Acces interzis' });
    const safe = filterPhone(content.trim());
    const msg = await Message.create({ conversation_id: req.params.convId, sender_id: req.user.id, content: safe });
    const u = await User.findById(req.user.id);
    res.status(201).json({ ...msg.toObject(), sender_name: u?.name, was_filtered: safe !== content.trim() });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
