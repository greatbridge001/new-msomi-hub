import { requireAuthOrRedirect } from './api.js';
import { initShell } from './shell.js';

requireAuthOrRedirect();
initShell({ active: 'toolkit', title: 'Student Toolkit' });

const TIPS = [
  'Use the Pomodoro technique — 25 minutes focused study, 5 minutes break — to get more done without burning out.',
  'Review your notes within 24 hours of class. It cuts your revision time before exams dramatically.',
  'Write your CATs and assignment deadlines into Msomi Hub the moment your lecturer announces them.',
  'Group study works best in sessions of 3-4 people — any more and it turns into a chat session.',
  'Track every shilling for one month. Most students are surprised where their allowance actually goes.'
];
document.getElementById('toolkitTip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)];