function escapeMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/\\\\/g, '\\\\\\\\')
    .replace(/[_*\[\]()~`>#+=|{}.!-]/g, '\\\\$&');
}

const tests = [
  'Halo! Apa kabar?',
  'Ini [link] dan (button)',
  'Gunakan _italic_ dan *bold*',
  'Nomor: 1.2.3 - test+ok',
  'Path: C:\\Users\\test',
];

for (const t of tests) {
  console.log('Original:', t);
  console.log('Escaped:', escapeMarkdown(t));
  console.log('---');
}
