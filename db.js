const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://serbumarian911_db_user:D7LgSP2mSKTJtxcP@cluster0.iv6noig.mongodb.net/handyro?appName=Cluster0';

mongoose.connect(MONGODB_URI).then(() => {
  console.log('✅ MongoDB conectat!');
  seedIfEmpty();
}).catch(err => console.error('❌ MongoDB eroare:', err));

// SCHEMAS
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['client','meserias','admin','horeca'], required: true },
horeca_name: { type: String, default: '' },
horeca_type: { type: String, default: '' },
  assigned_worker: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', default: null },
  status: { type: String, enum: ['active','pending','blocked'], default: 'active' },
phone: { type: String, default: '' },
}, { timestamps: true });

const WorkerSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  specialization: { type: String, default: 'General' },
  categories: [{ type: String }],
  rating: { type: Number, default: 5.0 },
  reviews_count: { type: Number, default: 0 },
  city: { type: String, default: 'București' },
  available: { type: Boolean, default: true },
  pfa_name: { type: String, default: '' },
  cui: { type: String, default: '' },
  iban: { type: String, default: '' },
}, { timestamps: true });

const PriceSchema = new mongoose.Schema({
  worker_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', required: true },
  category: { type: String, required: true },
  price: { type: Number, required: true },
});

const JobSchema = new mongoose.Schema({
  client_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  worker_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker' },
  category: { type: String, required: true },
  description: { type: String },
  urgency: { type: String, default: 'normal' },
  time_slot: { type: String, default: 'Orice interval' },
  photos: [String],
  status: { type: String, enum: ['pending','accepted','completed','cancelled'], default: 'pending' },
  city: { type: String, default: 'București' },
  subcat_name: String,
  subcat_price: Number,
  completed_at: Date,
  job_date: Date,
}, { timestamps: true });

const ConversationSchema = new mongoose.Schema({
  job_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
  client_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  worker_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

const MessageSchema = new mongoose.Schema({
  conversation_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
  sender_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true },
  is_read: { type: Boolean, default: false },
}, { timestamps: true });

const SubcatPriceSchema = new mongoose.Schema({
  category: { type: String, required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  order: { type: Number, default: 0 },
});

const ReviewSchema = new mongoose.Schema({
  job_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true, unique: true },
  client_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  worker_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', required: true },
  stars: { type: Number, min: 1, max: 5, required: true },
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);
const Worker = mongoose.model('Worker', WorkerSchema);
const Price = mongoose.model('Price', PriceSchema);
const Job = mongoose.model('Job', JobSchema);
const Conversation = mongoose.model('Conversation', ConversationSchema);
const Message = mongoose.model('Message', MessageSchema);
const Review = mongoose.model('Review', ReviewSchema);
const SubcatPrice = mongoose.model('SubcatPrice', SubcatPriceSchema);

const CATEGORIES = [
  'Instalații sanitare',
  'Instalații electrice',
  'Renovări & zugrăveală',
  'Curățenie profesională',
  'Tâmplărie & mobilier',
  'Mentenanță generală',
];

async function seedIfEmpty() {
  const count = await User.countDocuments();
  if (count > 0) return;

  const hash = pw => bcrypt.hashSync(pw, 10);

  const admin = await User.create({ name: 'Admin HandyRO', email: 'admin@handyro.ro', password: hash('admin123'), role: 'admin', status: 'active' });
  const ionut = await User.create({ name: 'Ionuț Șerban', email: 'ionut@handyro.ro', password: hash('ionut123'), role: 'meserias', status: 'active' });
  const mihai = await User.create({ name: 'Mihai Ionescu', email: 'mihai@handyro.ro', password: hash('mihai123'), role: 'meserias', status: 'active' });
  const maria = await User.create({ name: 'Maria Popescu', email: 'maria@handyro.ro', password: hash('maria123'), role: 'client', status: 'active' });
  const dan   = await User.create({ name: 'Dan Radu', email: 'dan@handyro.ro', password: hash('dan123'), role: 'client', status: 'active' });

  const w1 = await Worker.create({ user_id: ionut._id, specialization: 'Toate categoriile', rating: 5.0, reviews_count: 214, city: 'București' });
  const w2 = await Worker.create({ user_id: mihai._id, specialization: 'Instalații electrice', rating: 4.7, reviews_count: 32, city: 'București' });

  // Preturi Ionut
  await Price.insertMany([
    { worker_id: w1._id, category: 'Instalații sanitare', price: 300 },
    { worker_id: w1._id, category: 'Instalații electrice', price: 280 },
    { worker_id: w1._id, category: 'Renovări & zugrăveală', price: 250 },
    { worker_id: w1._id, category: 'Curățenie profesională', price: 180 },
    { worker_id: w1._id, category: 'Tâmplărie & mobilier', price: 220 },
    { worker_id: w1._id, category: 'Mentenanță generală', price: 200 },
  ]);
  // Preturi Mihai
  await Price.create({ worker_id: w2._id, category: 'Instalații electrice', price: 150 });

  const job1 = await Job.create({ client_id: maria._id, worker_id: w1._id, category: 'Instalații sanitare', description: 'Robinet defect', urgency: 'urgent', time_slot: 'După-amiaza', photos: [], status: 'completed', completed_at: new Date() });
  const job2 = await Job.create({ client_id: dan._id, worker_id: w1._id, category: 'Instalații electrice', description: 'Tablou electric', urgency: 'normal', time_slot: 'Dimineața', photos: [], status: 'accepted' });

  const conv1 = await Conversation.create({ job_id: job1._id, client_id: maria._id, worker_id: ionut._id });
  await Message.insertMany([
    { conversation_id: conv1._id, sender_id: maria._id, content: 'Bună ziua! Am o problemă cu robinetul din bucătărie, curge continuu.', is_read: true },
    { conversation_id: conv1._id, sender_id: ionut._id, content: 'Bună! Pot veni să verific astăzi după-amiază. Vi se potrivește între 15:00-17:00?', is_read: true },
    { conversation_id: conv1._id, sender_id: maria._id, content: 'Da, perfect! Vă aștept la Str. Mihai Eminescu nr. 12, ap. 4.', is_read: false },
  ]);

  // Seed subcategorii cu preturi
  const subcats = [
    // Instalatii sanitare
    {category:'Instalații sanitare',name:'Schimbat robinet',price:120,order:1},
    {category:'Instalații sanitare',name:'Montat baterie chiuvetă/duș',price:150,order:2},
    {category:'Instalații sanitare',name:'Deblocat țeavă',price:180,order:3},
    {category:'Instalații sanitare',name:'Montat boiler',price:400,order:4},
    {category:'Instalații sanitare',name:'Remediat scurgere',price:150,order:5},
    {category:'Instalații sanitare',name:'Montat vas WC',price:200,order:6},
    {category:'Instalații sanitare',name:'Montat lavoar',price:180,order:7},
    {category:'Instalații sanitare',name:'Montat cabină duș',price:350,order:8},
    {category:'Instalații sanitare',name:'Verificat instalație apă',price:120,order:9},
    {category:'Instalații sanitare',name:'Montat filtru apă',price:150,order:10},
    // Instalatii electrice
    {category:'Instalații electrice',name:'Montat priză/întrerupător',price:80,order:1},
    {category:'Instalații electrice',name:'Montat corp de iluminat',price:100,order:2},
    {category:'Instalații electrice',name:'Verificat tablou electric',price:180,order:3},
    {category:'Instalații electrice',name:'Tras cablu electric (până la 10m)',price:200,order:4},
    {category:'Instalații electrice',name:'Montat spot/aplică',price:80,order:5},
    {category:'Instalații electrice',name:'Montat ventilator baie',price:120,order:6},
    {category:'Instalații electrice',name:'Montat termostat',price:150,order:7},
    {category:'Instalații electrice',name:'Remediat pană curent',price:150,order:8},
    {category:'Instalații electrice',name:'Montat sonerie/interfon',price:200,order:9},
    {category:'Instalații electrice',name:'Montat pompă recirculare',price:250,order:10},
    // Renovari
    {category:'Renovări & zugrăveală',name:'Zugrăvit cameră (vopsea client)',price:250,order:1},
    {category:'Renovări & zugrăveală',name:'Zugrăvit cameră (vopsea inclusă)',price:400,order:2},
    {category:'Renovări & zugrăveală',name:'Glet + vopsit perete (mp)',price:45,order:3},
    {category:'Renovări & zugrăveală',name:'Montat gresie (mp)',price:60,order:4},
    {category:'Renovări & zugrăveală',name:'Montat faianță (mp)',price:65,order:5},
    {category:'Renovări & zugrăveală',name:'Montat parchet (mp)',price:50,order:6},
    {category:'Renovări & zugrăveală',name:'Tencuit perete (mp)',price:40,order:7},
    {category:'Renovări & zugrăveală',name:'Montat plinte',price:150,order:8},
    {category:'Renovări & zugrăveală',name:'Montat tavan fals (mp)',price:70,order:9},
    {category:'Renovări & zugrăveală',name:'Demontat faianță/gresie (mp)',price:25,order:10},
    // Curatenie
    {category:'Curățenie profesională',name:'Curățenie apartament 1 cameră',price:200,order:1},
    {category:'Curățenie profesională',name:'Curățenie apartament 2 camere',price:280,order:2},
    {category:'Curățenie profesională',name:'Curățenie apartament 3 camere',price:350,order:3},
    {category:'Curățenie profesională',name:'Curățenie post-construcție (mp)',price:8,order:4},
    {category:'Curățenie profesională',name:'Curățenie birouri (mp)',price:5,order:5},
    {category:'Curățenie profesională',name:'Spălat geamuri apartament',price:150,order:6},
    {category:'Curățenie profesională',name:'Curățenie după mutare',price:300,order:7},
    {category:'Curățenie profesională',name:'Dezinfecție spații',price:250,order:8},
    {category:'Curățenie profesională',name:'Curățenie baie completă',price:120,order:9},
    {category:'Curățenie profesională',name:'Spălat covoare/mochete',price:80,order:10},
    // Tamplarie
    {category:'Tâmplărie & mobilier',name:'Asamblat mobilier IKEA (piesă)',price:80,order:1},
    {category:'Tâmplărie & mobilier',name:'Montat ușă interior',price:280,order:2},
    {category:'Tâmplărie & mobilier',name:'Montat jaluzele/rolete',price:80,order:3},
    {category:'Tâmplărie & mobilier',name:'Montat perdele/draperii',price:100,order:4},
    {category:'Tâmplărie & mobilier',name:'Montat oglindă/tablou',price:60,order:5},
    {category:'Tâmplărie & mobilier',name:'Reparat ușă/geam',price:150,order:6},
    {category:'Tâmplărie & mobilier',name:'Montat dulap suspendat',price:120,order:7},
    {category:'Tâmplărie & mobilier',name:'Montat polițe/rafturi',price:100,order:8},
    {category:'Tâmplărie & mobilier',name:'Reparat mobilier',price:150,order:9},
    {category:'Tâmplărie & mobilier',name:'Montat pat/canapea extensibilă',price:120,order:10},
    // Mentenanta
    {category:'Mentenanță generală',name:'Vizită diagnostic',price:120,order:1},
    {category:'Mentenanță generală',name:'Reparații diverse (1h)',price:120,order:2},
    {category:'Mentenanță generală',name:'Montat aer condiționat',price:400,order:3},
    {category:'Mentenanță generală',name:'Curățat aer condiționat',price:200,order:4},
    {category:'Mentenanță generală',name:'Montat TV pe perete',price:150,order:5},
    {category:'Mentenanță generală',name:'Montat suport bicicletă/rafturi',price:100,order:6},
    {category:'Mentenanță generală',name:'Reparat gard/poartă',price:200,order:7},
    {category:'Mentenanță generală',name:'Montat copertină/prelată',price:250,order:8},
    {category:'Mentenanță generală',name:'Igienizare țevi/sifoane',price:150,order:9},
    {category:'Mentenanță generală',name:'Reparat urgențe diverse',price:180,order:10},
  ];
  await SubcatPrice.insertMany(subcats);
  console.log('✅ Date seed introduse în MongoDB');
}

const ContactMsgSchema = new mongoose.Schema({
  sender_name: String,
  sender_email: String,
  sender_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  content: { type: String, required: true },
  is_read: { type: Boolean, default: false },
  reply: String,
}, { timestamps: true });

const ContactMsg = mongoose.model('ContactMsg', ContactMsgSchema);

// Pret per meșter per subcategorie
const WorkerSubcatPriceSchema = new mongoose.Schema({
  worker_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', required: true },
  subcat_id: { type: mongoose.Schema.Types.ObjectId, ref: 'SubcatPrice', required: true },
  price: { type: Number, required: true },
});
WorkerSubcatPriceSchema.index({ worker_id: 1, subcat_id: 1 }, { unique: true });
const WorkerSubcatPrice = mongoose.model('WorkerSubcatPrice', WorkerSubcatPriceSchema);

module.exports = { User, Worker, Price, Job, Conversation, Message, Review, SubcatPrice, ContactMsg, WorkerSubcatPrice, CATEGORIES };
