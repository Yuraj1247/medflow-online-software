const fetch = require('node-fetch');

async function test() {
    try {
        const response = await fetch('http://localhost:5000/api/doctor/page-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                doctor_id: 'test-doctor',
                paper_size: 'A4',
                header_enabled: 1,
                margin_top_cm: 2,
                margin_left_cm: 2,
                margin_right_cm: 2,
                margin_bottom_cm: 2
            })
        });
        const text = await response.text();
        console.log('Status:', response.status);
        console.log('Body:', text);
    } catch (e) {
        console.error(e);
    }
}

test();
