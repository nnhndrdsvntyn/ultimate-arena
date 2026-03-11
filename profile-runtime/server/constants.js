const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
let key = '';
for (let i = 0; i < 30; i++) {
    key += characters.charAt(Math.floor(Math.random() * characters.length));
}
console.log("ADMIN KEY:", key);

export const adminKey = key;