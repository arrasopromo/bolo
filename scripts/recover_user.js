const mongoose = require('mongoose');
require('dotenv').config();
const User = require('../models/User');

async function run() {
  const email = process.env.RECOVER_EMAIL;
  const name = process.env.RECOVER_NAME || 'Confeiteira';
  if (!email) {
    console.error('RECOVER_EMAIL não definido.');
    process.exit(1);
  }
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Conectado ao MongoDB');
    let user = await User.findOne({ email });
    if (!user) {
      user = new User({
        name,
        email,
        plan: 'complete',
        subscriptionStatus: 'active',
        subscriptionType: 'lifetime',
      });
    } else {
      user.name = user.name || name;
      user.plan = 'complete';
      user.subscriptionStatus = 'active';
      user.subscriptionType = 'lifetime';
      user.subscriptionExpiresAt = null;
    }
    await user.save();
    console.log('Usuário restaurado/criado com acesso completo:');
    console.log({
      email: user.email,
      name: user.name,
      plan: user.plan,
      subscriptionStatus: user.subscriptionStatus,
      subscriptionType: user.subscriptionType,
      subscriptionExpiresAt: user.subscriptionExpiresAt,
    });
  } catch (e) {
    console.error('Erro:', e.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

run();

