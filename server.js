const express = require('express');
const admin = require('firebase-admin');
const bodyParser = require('body-parser');
const shortid = require('shortid');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'))); // Melayani file statis

// Firebase Admin SDK setup
const serviceAccount = require('./firebase-service-account.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const urlsCollection = db.collection('urls');

// Endpoint untuk memendekkan URL
app.post('/shorten', async (req, res) => {
    const { originalUrl, customAlias, password, expireDate } = req.body;

    // Validasi input
    if (!originalUrl) {
        return res.status(400).json({ error: 'Original URL is required' });
    }

    let shortUrl;
    if (customAlias) {
        // Gunakan custom alias jika diberikan
        const existingUrl = await urlsCollection.where('shortUrl', '==', customAlias).get();
        if (!existingUrl.empty) {
            return res.status(400).json({ error: 'Alias kustom tidak tersedia' });
        }
        shortUrl = customAlias;
    } else {
        // Buat short URL dengan shortid
        shortUrl = shortid.generate();
    }

    // Simpan URL ke Firestore dengan ID otomatis
    const newUrl = {
        originalUrl,
        shortUrl,
        customAlias: customAlias || null,
        password: password || null,
        createdDate: admin.firestore.FieldValue.serverTimestamp(),
        expireDate: expireDate ? new Date(expireDate) : null
    };

    await urlsCollection.add(newUrl); // Menggunakan add untuk ID otomatis

    res.json({ shortUrl: `http://localhost:${PORT}/${shortUrl}` });
});

// Redirect dari short URL ke original URL
// Endpoint untuk mengakses URL pendek
app.get('/:shortUrl', async (req, res) => {
    const { shortUrl } = req.params;
    const urlSnapshot = await urlsCollection.where('shortUrl', '==', shortUrl).get();

    if (urlSnapshot.empty) {
        return res.status(404).json({ error: 'URL tidak ditemukan' });
    }

    const urlDoc = urlSnapshot.docs[0];
    const urlData = urlDoc.data();

    // Cek apakah URL sudah kedaluwarsa
    if (urlData.expireDate && new Date() > urlData.expireDate.toDate()) {
        return res.status(410).json({ error: 'URL telah kadaluwarsa' });
    }

    // Jika URL memiliki password
    if (urlData.password) {
        // Jika pengguna belum memasukkan password
        if (!req.query.password) {
            // Tampilkan halaman memasukkan password
            return res.sendFile(path.join(__dirname, 'public', 'password.html'));
        }

        // Jika pengguna telah memasukkan password
        if (req.query.password === urlData.password) {
            // Redirect ke original URL jika password valid
            return res.redirect(urlData.originalUrl);
        } else {
            return res.status(400).send('Password tidak sesuai');
        }
    }

    // Jika URL tidak memiliki password, langsung redirect ke original URL
    res.redirect(urlData.originalUrl);
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
