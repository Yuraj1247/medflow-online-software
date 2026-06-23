async function test() {
    const payload = {
        doctor_id: 'test-id',
        paper_size: 'A4',
        header_enabled: 1,
        margin_top_cm: 2,
        margin_left_cm: 2,
        margin_right_cm: 2,
        margin_bottom_cm: 2
    };

    try {
        console.log('Sending payload:', payload);
        const response = await fetch('http://localhost:5999/api/doctor/page-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const text = await response.text();
        console.log('Status:', response.status);
        if (text.trim().startsWith('{')) {
            console.log('Body:', JSON.parse(text));
        } else {
            console.log('Body (HTML/Text):', text.trim().substring(0, 100) + '...');
        }
    } catch (e) {
        console.error('Fetch Error:', e);
    }
}

test();
