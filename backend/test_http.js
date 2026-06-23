const http = require('http');

const data = JSON.stringify({
    doctor_id: 'test-doctor',
    paper_size: 'A4'
});

const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/doctor/page-settings',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

const req = http.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
        console.log('Status:', res.statusCode);
        console.log('Headers:', res.headers);
        console.log('Body:', body);
    });
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
});

req.write(data);
req.end();
