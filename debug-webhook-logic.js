const mongoose = require('mongoose');
const User = require('./models/User');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Mock Payload Data
const data = {
    event: 'pix_generated',
    status: 'waiting_payment',
    customer: {
        email: 'teste.debug@bellecake.com', // Unique email for this test
        name: 'Debug User'
    }
};

async function runDebug() {
    console.log('🐞 STARTING DEBUG SCRIPT...');
    
    // 1. Test DB Connection
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');
    } catch (e) {
        console.error('❌ MongoDB Connection Failed:', e);
        return;
    }

    // 2. Run Webhook Logic
    const status = data.status || '';
    const event = data.event || '';
    const email = data.customer?.email;

    const isPaidStatus = ['paid', 'approved', 'completed'].includes(status.toLowerCase());
    const isPixEvent = ['pix_gerado', 'pix_generated'].includes(event.toLowerCase());
    const isPaid = isPaidStatus || isPixEvent;

    console.log(`🤔 Logic Check: isPaidStatus=${isPaidStatus}, isPixEvent=${isPixEvent}, FINAL isPaid=${isPaid}`);

    if (isPaid && email) {
        try {
            console.log(`👤 Searching for user: ${email}`);
            let user = await User.findOne({ email });

            if (!user) {
                console.log('🆕 Creating NEW user...');
                const tempPass = Math.random().toString(36).slice(-8);
                const hashed = await bcrypt.hash(tempPass, 10);
                user = new User({
                    name: data.customer?.name || 'Cliente',
                    email: email,
                    password: hashed,
                    plan: 'complete',
                    subscriptionStatus: 'active',
                    subscriptionType: 'bonus',
                    subscriptionExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                });
            } else {
                console.log('🔄 Updating EXISTING user...');
                user.plan = 'complete';
                user.subscriptionStatus = 'active';
                user.subscriptionType = 'paid';
                user.subscriptionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
            }

            await user.save();
            console.log('✅ User saved to DB!');

            // 3. Test Email Sending
    console.log('📧 Testing Email Sending...');
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });

    // Verify Transporter
    try {
        await transporter.verify();
        console.log('✅ SMTP Connection Verified');
    } catch (smtpErr) {
        console.error('❌ SMTP Verification Failed:', smtpErr);
        console.log('⚠️ Check your .env EMAIL_USER and EMAIL_PASS');
    }

            const token = jwt.sign({ _id: user._id, name: user.name }, process.env.JWT_SECRET);
            const accessLink = `https://bellecake.com/membros?token=${token}`;

            const mailOptions = {
                from: `"BelleCake Debug" <${process.env.SMTP_USER}>`,
                to: email,
                subject: 'Teste de Debug BelleCake 🐞',
                text: `Seu link de acesso: ${accessLink}`
            };

            const info = await transporter.sendMail(mailOptions);
            console.log('✅ Email sent successfully:', info.messageId);

        } catch (err) {
            console.error('❌ Error in Logic Execution:', err);
        }
    } else {
        console.log('⚠️ Logic Condition Failed (isPaid && email)');
    }

    // Cleanup
    await mongoose.disconnect();
    console.log('👋 Debug Script Finished');
}

runDebug();