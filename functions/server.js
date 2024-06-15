const express = require('express');
const admin = require('firebase-admin');
const bodyParser = require('body-parser');
const shortid = require('shortid');
const path = require('path');
const bcrypt = require('bcrypt');
const SALT_ROUNDS = 10;

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

    let hashedPassword = null;
    if (password) {
        hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    }

    // Simpan URL ke Firestore dengan ID otomatis
    const newUrl = {
        originalUrl,
        shortUrl,
        customAlias: customAlias || null,
        password: hashedPassword,
        createdDate: admin.firestore.FieldValue.serverTimestamp(),
        expireDate: expireDate ? new Date(expireDate) : null
    };

    await urlsCollection.add(newUrl); // Menggunakan add untuk ID otomatis

    res.json({ shortUrl: `http://localhost:${PORT}/${shortUrl}` });
});

// Endpoint untuk mengakses URL pendek
app.get('/:shortUrl', async (req, res) => {
    const { shortUrl } = req.params;
    const urlSnapshot = await urlsCollection.where('shortUrl', '==', shortUrl).get();

    if (urlSnapshot.empty) {
        return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
    }

    const urlDoc = urlSnapshot.docs[0];
    const urlData = urlDoc.data();

    // Cek apakah URL sudah kedaluwarsa
    if (urlData.expireDate && new Date() > urlData.expireDate.toDate()) {
        // Hapus dokumen yang sudah kadaluwarsa
        await urlDoc.ref.delete();
        return res.status(410).sendFile(path.join(__dirname, 'public', 'expired.html'));
    }

    // Jika URL memiliki password
    if (urlData.password) {
        // Jika pengguna belum memasukkan password
        if (!req.query.password) {
            // Tampilkan halaman memasukkan password
            return res.sendFile(path.join(__dirname, 'public', 'password.html'));
        }

        // Verifikasi password yang dimasukkan pengguna
        const isPasswordValid = await bcrypt.compare(req.query.password, urlData.password);
        if (isPasswordValid) {
            // Redirect ke original URL jika password valid
            return res.redirect(urlData.originalUrl);
        } else {
            // Jika password salah, tampilkan pesan kesalahan di halaman password
            return res.send(`
                <!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Enter Password</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
        }

        .container {
            max-width: 400px;
            margin: 0 auto;
            text-align: center;
        }

        h2 {
            margin-bottom: 20px;
        }

        form {
            display: flex;
            flex-direction: column;
            align-items: center;
        }

        label {
            margin-bottom: 10px;
        }

        input[type="password"] {
            width: 100%;
            padding: 10px;
            margin-bottom: 20px;
            border: 1px solid #ccc;
            border-radius: 5px;
        }

        button {
            padding: 10px 20px;
            background-color: #007bff;
            color: #fff;
            border: none;
            border-radius: 5px;
            cursor: pointer;
        }

        button:hover {
            background-color: #0056b3;
        }
    </style>
</head>

<body>
    <div class="container">
        <h2>Masukkan Kata Sandi</h2>
        <h5>Kamu butuh kata sandi untuk melanjutkan</h5>
        <form method="GET" action="">
            <label for="password">Kata Sandi:</label>
            <input type="password" id="password" name="password" required>
            <div id="error-message" style="color: red;">Kata sandi tidak sesuai</div>
            <button type="submit">Submit</button>
        </form>
    </div>
</body>

</html>
            `);
        }
    }

    // Jika URL tidak memiliki password, langsung redirect ke original URL
    res.redirect(urlData.originalUrl);
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
