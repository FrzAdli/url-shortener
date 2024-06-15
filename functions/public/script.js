document.addEventListener('DOMContentLoaded', function () {
    // Fungsi untuk memeriksa apakah alias kustom valid
    function isValidAlias(alias) {
        const regex = /^[a-zA-Z0-9_-]+$/;
        return regex.test(alias.trim());
    }

    // Fungsi untuk memeriksa apakah kata sandi valid
    function isValidPassword(password) {
        const regex = /^[a-zA-Z0-9-_!@#$%^&*()+=]+$/;
        return regex.test(password.trim());
    }

    // Fungsi untuk mengubah visibilitas kata sandi
    function togglePasswordVisibility() {
        var passwordInput = document.getElementById('password');
        var togglePasswordButton = document.getElementById('toggle-password');
        var icon = togglePasswordButton.querySelector('i');

        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        } else {
            passwordInput.type = 'password';
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
    }


    // Fungsi untuk menghasilkan QR code untuk ditampilkan
    function generateQRCode(text, size) {
        var qrCodeContainer = document.getElementById(size === 128 ? 'qrcode' : 'qrcode-large');
        qrCodeContainer.innerHTML = '';
        new QRCode(qrCodeContainer, {
            text: text,
            width: size,
            height: size
        });
    }

    // Fungsi download QR Code
    function downloadQRCode() {
        const qrCodeContainer = document.getElementById('qrcode-large');
        const canvas = qrCodeContainer.querySelector('canvas');
        const downloadLink = document.getElementById('download-qr');

        if (canvas) {
            const image = canvas.toDataURL('image/png');
            downloadLink.href = image;
            downloadLink.download = 'QRCode.png';
        }
    }

    function copyToClipboard(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
    }

    document.getElementById('shorten-url-form').addEventListener('submit', async function (event) {
        event.preventDefault(); // Mencegah submit form

        const originalUrl = document.getElementById('original-url').value;
        const expireDate = document.getElementById('expire-date').value;
        const noExpire = document.getElementById('no-expire').checked;
        const customAlias = document.getElementById('custom-alias').value;
        const password = document.getElementById('password').value;

        if (originalUrl.trim() === '') {
            alert('Kolom "URL Asli" tidak boleh kosong!');
            return;
        }

        if (customAlias && !isValidAlias(customAlias)) {
            alert('Alias kustom hanya boleh mengandung karakter a-z, A-Z, 0-9, - dan _.');
            return;
        }

        if (password && !isValidPassword(password)) {
            alert('Kata sandi hanya boleh mengandung karakter a-z, A-Z, 0-9, -, _, dan simbol.');
            return;
        }

        const body = {
            originalUrl,
            expireDate: noExpire ? null : expireDate,
            customAlias,
            password
        };

        try {
            const response = await fetch('https://codshortener.netlify.app/.netlify/functions/server/shorten', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            // const response = await fetch('/shorten', {
            //     method: 'POST',
            //     headers: { 'Content-Type': 'application/json' },
            //     body: JSON.stringify(body)
            // });

            const data = await response.json();
            if (response.ok) {
                document.getElementById('shortened-link').textContent = data.shortUrl;
                generateQRCode(data.shortUrl, 128); // Generate small QR code for display
                generateQRCode(data.shortUrl, 512);

                // Hapus pesan kesalahan jika berhasil
                document.getElementById('alias-error').innerText = '';

                // Perbarui kelas tombol "Copy" setelah URL dipendekkan
                document.getElementById('copy-button').classList.remove('d-none');
                document.getElementById('copy-button').classList.add('d-block');

                // Perbarui kelas tombol "Download" setelah URL dipendekkan
                document.getElementById('download-qr').classList.remove('d-none');
                document.getElementById('download-qr').classList.add('d-block');
            } else {
                document.getElementById('alias-error').innerText = data.error; // Tampilkan pesan kesalahan
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Error processing request');
        }

        // Hapus nilai input setelah formulir dikirimkan
        document.getElementById('original-url').value = '';
        document.getElementById('expire-date').value = '';
        document.getElementById('expire-date').disabled = true;
        document.getElementById('no-expire').checked = true;
        document.getElementById('custom-alias').value = '';
        document.getElementById('password').value = '';

        // Kembalikan icon dll
        var copybutton = document.getElementById('copy-button');
        var icon = copybutton.querySelector('i');
        icon.classList.add('fa-regular');
        icon.classList.add('fa-copy');
        icon.classList.remove('fa-solid');
        icon.classList.remove('fa-clipboard-check');
    });

    // Tambahkan event listener untuk mengubah visibilitas kata sandi saat tombol diklik
    document.getElementById('toggle-password').addEventListener('click', togglePasswordVisibility);

    function checkExpirationStatus() {
        var expireDateInput = document.getElementById('expire-date');
        var noExpireCheckbox = document.getElementById('no-expire');

        if (noExpireCheckbox.checked) {
            expireDateInput.disabled = true; // Nonaktifkan input tanggal kedaluwarsa jika "Selamanya" dicentang
        } else {
            expireDateInput.disabled = false; // Aktifkan input tanggal kedaluwarsa jika "Selamanya" tidak dicentang
        }
    }

    document.getElementById('no-expire').addEventListener('change', checkExpirationStatus);
    checkExpirationStatus();

    document.getElementById('copy-button').addEventListener('click', function () {
        var copybutton = document.getElementById('copy-button');
        var icon = copybutton.querySelector('i');
        icon.classList.remove('fa-regular');
        icon.classList.remove('fa-copy');
        icon.classList.add('fa-solid');
        icon.classList.add('fa-clipboard-check');

        const shortenedLink = document.getElementById('shortened-link').textContent;
        copyToClipboard(shortenedLink);
    });

    document.getElementById('download-qr').addEventListener('click', downloadQRCode);
});
