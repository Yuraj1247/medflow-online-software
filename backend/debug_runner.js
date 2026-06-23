const { spawn } = require('child_process');
const fs = require('fs');

const server = spawn('node', ['server.js'], { cwd: __dirname });
const logFile = fs.createWriteStream('debug_log.txt');

server.stdout.pipe(logFile);
server.stderr.pipe(logFile);

console.log('Server started...');

setTimeout(() => {
    console.log('Running test...');
    const test = spawn('node', ['test_reliable.js'], { cwd: __dirname });

    test.stdout.on('data', (data) => console.log('Test Out:', data.toString()));
    test.stderr.on('data', (data) => console.log('Test Err:', data.toString()));

    test.on('close', () => {
        console.log('Test finished. Reading logs...');
        setTimeout(() => {
            const logs = fs.readFileSync('debug_log.txt', 'utf8');
            console.log('--- SERVER LOGS ---');
            console.log(logs);
            server.kill();
            process.exit(0);
        }, 1000);
    });
}, 4000);
