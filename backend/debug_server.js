const express = require('express');
const app = express();
app.use(express.json());

app.post('/api/doctor/page-settings', (req, res) => {
    console.log('DEBUG: Received body:', req.body);
    res.json({ message: 'debug ok', received: req.body });
});

app.listen(5001, () => console.log('Debug server on 5001'));
