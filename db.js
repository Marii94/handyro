const Datastore = require('nedb-promises');
const path = require('path');
const bcrypt = require('bcryptjs');

const dir = path.join(__dirname, 'data');
require('fs').mkdirSync(dir, { recursive: true });

const db = {
  users: Datastore.create({ filename: path.join(dir, 'users.db'), autoload: true }),
  workers: Datastore.create({ filename: path.join(dir, 'workers.db'), autoload: true }),
  jobs: Datastore.create({ filename: path.join(dir, 'jobs.db'), autoload: true }),
  conversations: Datastore.create({ filename: path.join(dir, 'conversations.db'), autoload: true }),
  messages: Datastore.create({ filename: path.join(dir, 'messages.db'), autoload: true }),
  reviews: Datastore.create({ filename: path.join(dir, 'reviews.db'), autoload: true }),
};

async function seedIfEmpty() {
  const count = await db.users.count({});
  if (count > 0) return;
  const hash = (pw) => bcrypt.hashSync(pw, 10);
  const now = new Date().toISOString();

  const adminId = 'user_admin';
  const ionutId = 'user_ionut';
  const mihaiId = 'user_mihai';
  const mariaId = 'user_maria';
  const danId   = 'user_dan';

  await db.users.insert([
    { _id: adminId, name: 'Admin HandyRO', email: 'admin@handyro.ro', password: hash('admin123'), role: 'admin', status: 'active', created_at: now },
    { _id: ionutId, name: 'Ionuț Șerban',  email: 'ionut@handyro.ro', password: hash('ionut123'), role: 'meserias', status: 'active', created_at: now },
    { _id: mihaiId, name: 'Mihai Ionescu', email: 'mihai@handyro.ro', password: hash('mihai123'), role: 'meserias', status: 'pending', created_at: now },
    { _id: mariaId, name: 'Maria Popescu', email: 'maria@handyro.ro', password: hash('maria123'), role: 'client', status: 'active', created_at: now },
    { _id: danId,   name: 'Dan Radu',      email: 'dan@handyro.ro',   password: hash('dan123'),   role: 'client', status: 'active', created_at: now },
  ]);

  const w1Id = 'worker_ionut';
  const w2Id = 'worker_mihai';
  await db.workers.insert([
    { _id: w1Id, user_id: ionutId, specialization: 'Toate categoriile', price_per_job: 100, rating: 5.0, reviews_count: 214, city: 'București', available: true },
    { _id: w2Id, user_id: mihaiId, specialization: 'Instalații electrice', price_per_job: 120, rating: 5.0, reviews_count: 0, city: 'București', available: true },
  ]);

  const job1Id = 'job_1';
  const job2Id = 'job_2';
  await db.jobs.insert([
    { _id: job1Id, client_id: mariaId, worker_id: w1Id, category: 'Instalații sanitare', description: 'Robinet defect în bucătărie', urgency: 'urgent', time_slot: 'După-amiaza', photos: [], status: 'completed', city: 'București', created_at: now, completed_at: now },
    { _id: job2Id, client_id: danId,   worker_id: w1Id, category: 'Renovări & zugrăveală', description: 'Cameră 18mp', urgency: 'normal', time_slot: 'Dimineața', photos: [], status: 'accepted', city: 'București', created_at: now },
  ]);

  const conv1Id = 'conv_1';
  await db.conversations.insert({ _id: conv1Id, job_id: job1Id, client_id: mariaId, worker_id: ionutId, created_at: now });
  await db.messages.insert([
    { conversation_id: conv1Id, sender_id: mariaId, content: 'Bună ziua! Am o problemă cu robinetul din bucătărie, curge continuu.', is_read: true, created_at: now },
    { conversation_id: conv1Id, sender_id: ionutId, content: 'Bună! Pot veni să verific astăzi după-amiază. Vi se potrivește între 15:00-17:00?', is_read: true, created_at: now },
    { conversation_id: conv1Id, sender_id: mariaId, content: 'Da, perfect! Vă aștept la Str. Mihai Eminescu nr. 12, ap. 4.', is_read: false, created_at: now },
  ]);

  console.log('✅ Date seed introduse');
}

seedIfEmpty().catch(console.error);
module.exports = db;
