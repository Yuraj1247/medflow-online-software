async function testApi() {
    try {
        const res = await fetch('http://localhost:5000/api/users');
        console.log('Status:', res.status);
        const data = await res.json();
        console.log('Data:', JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error:', e.message);
    }
}

testApi();
