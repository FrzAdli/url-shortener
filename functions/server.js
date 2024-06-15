const express = require('express');
const serverless = require('serverless-http');
const admin = require('firebase-admin');
const bodyParser = require('body-parser');
const shortid = require('shortid');
const path = require('path');
const bcrypt = require('bcrypt');
require('dotenv').config();

const app = express();
const router = express.Router();

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'))); // Menyediakan file statis

// Konfigurasi Firebase Admin SDK
const serviceAccount = {
    type: process.env.FIREBASE_TYPE,
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: process.env.FIREBASE_AUTH_URI,
    token_uri: process.env.FIREBASE_TOKEN_URI,
    auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
    client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
    universe_domain: "googleapis.com"
};

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const urlsCollection = db.collection('urls');

// Endpoint untuk memendekkan URL
router.post('/shorten', async (req, res) => {
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
            return res.status(400).json({ error: 'Custom alias is not available' });
        }
        shortUrl = customAlias;
    } else {
        // Buat short URL dengan shortid
        shortUrl = shortid.generate();
    }

    let hashedPassword = null;
    if (password) {
        hashedPassword = await bcrypt.hash(password, 10);
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

    res.json({ shortUrl: `https://codshortener.netlify.app/${shortUrl}` });
    // res.json({ shortUrl: `http://localhost:3000/${shortUrl}` });
});

// Endpoint untuk mengakses URL pendek
router.get('/:shortUrl', async (req, res) => {
    const { shortUrl } = req.params;

    try {
        const urlSnapshot = await urlsCollection.where('shortUrl', '==', shortUrl).get();

        if (urlSnapshot.empty) {
            return res.status(404).send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>URL not Found</title>
</head>
<body>
    <h1>404 - URL Tidak Ditemukan</h1>
    <p>URL yang Anda cari tidak ditemukan atau sudah kedaluwarsa.</p>
</body>
</html>
`);
        }

        const urlDoc = urlSnapshot.docs[0];
        const urlData = urlDoc.data();

        // Cek apakah URL sudah kedaluwarsa
        if (urlData.expireDate && new Date() > urlData.expireDate.toDate()) {
            // Hapus dokumen yang sudah kadaluwarsa
            await urlDoc.ref.delete();
            return res.status(410).send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Expired URL</title>
</head>
<body>
    <h1>410 - URL Kedaluwarsa</h1>
    <p>URL yang Anda cari telah kedaluwarsa dan akan menjadi tidak tersedia.</p>
</body>
</html>
`);
        }

        // Jika URL memiliki password
        if (urlData.password) {
            // Jika pengguna belum memasukkan password
            if (!req.query.password) {
                // Tampilkan halaman memasukkan password
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
                                <button type="submit">Submit</button>
                            </form>
                        </div>
                    </body>
                    </html>
                `);
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
    } catch (error) {
        console.error('Error in /:shortUrl endpoint:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.use('/.netlify/functions/server', router);
// app.use('/', router);

// app.listen(3000, () => {
//     console.log(`Server running on port 3000`);
//   });

module.exports.handler = app;
