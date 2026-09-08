/**
 * Seeds sample content into every admin-managed section so the site
 * isn't empty during testing/demo. Safe to re-run - it clears and
 * re-inserts these tables only (never touches users, payments, or
 * any per-student data like timetables/GPA/budget).
 *
 * Usage: npm run db:seed
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const announcements = [
  {
    title: 'Welcome to StudentFlow Kenya',
    content: 'StudentFlow Kenya helps you manage your timetable, GPA, budget, and stay on top of HELB and scholarship opportunities — all in one place. Explore the dashboard to get started.',
    category: 'general'
  },
  {
    title: 'Semester Registration Reminder',
    content: 'Most universities open unit registration in the first two weeks of the semester. Confirm your registration status on your university portal to avoid late registration penalties.',
    category: 'academic'
  },
  {
    title: 'New Feature: CAT & Assignment Reminders',
    content: 'You can now set reminders for CATs, assignments, and exams from your dashboard. You will see them listed by due date so nothing sneaks up on you.',
    category: 'platform'
  }
];

const helbUpdates = [
  {
    title: 'HELB First-Time Applicant Window',
    content: 'First-time HELB applicants should apply as soon as admission letters are issued. Ensure your National ID, admission letter, and parent/guardian details are ready before starting the application.',
    update_type: 'helb'
  },
  {
    title: 'HELB Loan Disbursement Schedule',
    content: 'HELB typically disburses funds in batches per institution once verification is complete. Check your HELB portal status regularly rather than waiting on email notifications alone.',
    update_type: 'helb'
  },
  {
    title: 'Mastercard Foundation Scholarship',
    content: 'Several Kenyan universities partner with the Mastercard Foundation to offer full scholarships to financially disadvantaged but academically strong students. Check with your university financial aid office for eligibility.',
    update_type: 'scholarship'
  },
  {
    title: 'County Bursary Applications',
    content: 'Most county governments open bursary applications at the start of each financial year (July) and mid-year (January). Applications are usually submitted through your local Ward office.',
    update_type: 'bursary'
  }
];

const opportunities = [
  {
    title: 'Software Engineering Internship',
    description: 'Looking for undergraduate students in Computer Science, IT, or related fields for a 3-month internship covering web development and cloud basics.',
    opportunity_type: 'internship',
    organization: 'Sample Tech Ltd',
    link: 'https://example.com/careers',
    deadline: null
  },
  {
    title: 'Industrial Attachment - Business Students',
    description: 'Attachment opportunity for business, finance, and economics students to gain hands-on experience in operations and finance departments.',
    opportunity_type: 'attachment',
    organization: 'Sample Bank Kenya',
    link: 'https://example.com/attachment',
    deadline: null
  },
  {
    title: 'Graduate Trainee Programme',
    description: 'A 12-month structured graduate trainee programme rotating across departments, open to recent graduates with a second-class upper degree or higher.',
    opportunity_type: 'graduate_trainee',
    organization: 'Sample Manufacturing Co.',
    link: 'https://example.com/graduate-trainee',
    deadline: null
  },
  {
    title: 'Remote Data Entry / Online Job',
    description: 'Flexible remote data entry role suitable for students, paid per completed task. Basic computer literacy and reliable internet required.',
    opportunity_type: 'online_job',
    organization: 'Sample Outsourcing Ltd',
    link: 'https://example.com/online-jobs',
    deadline: null
  },
  {
    title: 'National Innovation Challenge',
    description: 'Annual competition inviting university students to pitch tech-driven solutions to local problems. Cash prizes and incubation support for top teams.',
    opportunity_type: 'competition',
    organization: 'Sample Innovation Hub',
    link: 'https://example.com/challenge',
    deadline: null
  }
];

// 100 verses so the daily rotation (see seed loop below, which assigns one
// per day starting today) runs for 100 days before it has to repeat.
const bibleVerses = [
  { verse_text: 'I can do all things through Christ who strengthens me.', reference: 'Philippians 4:13' },
  { verse_text: 'Trust in the Lord with all your heart and lean not on your own understanding.', reference: 'Proverbs 3:5' },
  { verse_text: 'For I know the plans I have for you, plans to prosper you and give you hope and a future.', reference: 'Jeremiah 29:11' },
  { verse_text: 'Fear not, for I am with you; I will strengthen you and help you.', reference: 'Isaiah 41:10' },
  { verse_text: 'Be strong and courageous; do not be afraid, for the Lord your God is with you wherever you go.', reference: 'Joshua 1:9' },
  { verse_text: 'God is our refuge and strength, an ever-present help in trouble.', reference: 'Psalm 46:1' },
  { verse_text: 'In all things God works for the good of those who love him.', reference: 'Romans 8:28' },
  { verse_text: 'Commit your work to the Lord, and your plans will be established.', reference: 'Proverbs 16:3' },
  { verse_text: 'Whatever you do, work at it with all your heart, as for the Lord and not for men.', reference: 'Colossians 3:23' },
  { verse_text: 'Do not be anxious about anything, but present your requests to God.', reference: 'Philippians 4:6' },
  { verse_text: 'The peace of God, which transcends all understanding, will guard your hearts and minds.', reference: 'Philippians 4:7' },
  { verse_text: 'Seek first the kingdom of God, and all these things will be added to you.', reference: 'Matthew 6:33' },
  { verse_text: 'The Lord is my shepherd; I shall not want.', reference: 'Psalm 23:1' },
  { verse_text: 'Those who hope in the Lord will renew their strength and soar on wings like eagles.', reference: 'Isaiah 40:31' },
  { verse_text: 'God has not given us a spirit of fear, but of power, love, and a sound mind.', reference: '2 Timothy 1:7' },
  { verse_text: 'Let us not grow weary in doing good, for in due season we will reap if we do not give up.', reference: 'Galatians 6:9' },
  { verse_text: 'If any of you lacks wisdom, let him ask God, who gives generously to all.', reference: 'James 1:5' },
  { verse_text: 'In all your ways acknowledge Him, and He will make your paths straight.', reference: 'Proverbs 3:6' },
  { verse_text: 'I lift up my eyes to the hills; my help comes from the Lord.', reference: 'Psalm 121:1-2' },
  { verse_text: 'Be strong and courageous; the Lord your God goes with you and will never leave you.', reference: 'Deuteronomy 31:6' },
  { verse_text: 'Come to me, all who are weary and burdened, and I will give you rest.', reference: 'Matthew 11:28' },
  { verse_text: 'Delight yourself in the Lord, and He will give you the desires of your heart.', reference: 'Psalm 37:4' },
  { verse_text: 'The plans of the diligent lead surely to abundance.', reference: 'Proverbs 21:5' },
  { verse_text: 'There is a time for everything, a season for every activity under heaven.', reference: 'Ecclesiastes 3:1' },
  { verse_text: 'Do not conform to the pattern of this world, but be transformed by the renewing of your mind.', reference: 'Romans 12:2' },
  { verse_text: 'God is faithful; He will not let you be tempted beyond what you can bear.', reference: '1 Corinthians 10:13' },
  { verse_text: 'The Lord is my light and my salvation; whom shall I fear?', reference: 'Psalm 27:1' },
  { verse_text: 'The Lord is close to the brokenhearted and saves those who are crushed in spirit.', reference: 'Psalm 34:18' },
  { verse_text: 'Train up a child in the way he should go, and when he is old he will not depart from it.', reference: 'Proverbs 22:6' },
  { verse_text: 'You will keep in perfect peace those whose minds are steadfast, because they trust in you.', reference: 'Isaiah 26:3' },
  { verse_text: 'Faith is confidence in what we hope for and assurance about what we do not see.', reference: 'Hebrews 11:1' },
  { verse_text: 'Cast all your anxiety on Him, because He cares for you.', reference: '1 Peter 5:7' },
  { verse_text: 'Your word is a lamp for my feet, a light on my path.', reference: 'Psalm 119:105' },
  { verse_text: 'The heart of the discerning acquires knowledge, for the ears of the wise seek it out.', reference: 'Proverbs 18:15' },
  { verse_text: 'My grace is sufficient for you, for my power is made perfect in weakness.', reference: '2 Corinthians 12:9' },
  { verse_text: 'Plans fail for lack of counsel, but with many advisers they succeed.', reference: 'Proverbs 15:22' },
  { verse_text: 'The Lord is good, a refuge in times of trouble.', reference: 'Nahum 1:7' },
  { verse_text: 'Cast your cares on the Lord and He will sustain you.', reference: 'Psalm 55:22' },
  { verse_text: 'Do not worry about tomorrow, for tomorrow will worry about itself.', reference: 'Matthew 6:34' },
  { verse_text: 'May the God of hope fill you with all joy and peace as you trust in Him.', reference: 'Romans 15:13' },
  { verse_text: 'Those who work their land will have abundant food.', reference: 'Proverbs 12:11' },
  { verse_text: 'Though the righteous fall seven times, they rise again.', reference: 'Proverbs 24:16' },
  { verse_text: 'He who began a good work in you will carry it on to completion.', reference: 'Philippians 1:6' },
  { verse_text: 'We are God\u2019s handiwork, created to do good works.', reference: 'Ephesians 2:10' },
  { verse_text: 'Teach us to number our days, that we may gain a heart of wisdom.', reference: 'Psalm 90:12' },
  { verse_text: 'Lazy hands make for poverty, but diligent hands bring wealth.', reference: 'Proverbs 10:4' },
  { verse_text: 'Rejoice always, pray continually, give thanks in all circumstances.', reference: '1 Thessalonians 5:16-18' },
  { verse_text: 'Let your light shine before others, that they may see your good deeds.', reference: 'Matthew 5:16' },
  { verse_text: 'Each one should test their own actions, then they can take pride in themselves alone.', reference: 'Galatians 6:4' },
  { verse_text: 'I have set the Lord always before me; I shall not be shaken.', reference: 'Psalm 16:8' },
  { verse_text: 'Let the wise listen and add to their learning.', reference: 'Proverbs 1:5' },
  { verse_text: 'Peace I leave with you; do not let your hearts be troubled.', reference: 'John 14:27' },
  { verse_text: 'When you pass through the waters, I will be with you.', reference: 'Isaiah 43:2' },
  { verse_text: 'As iron sharpens iron, so one person sharpens another.', reference: 'Proverbs 27:17' },
  { verse_text: 'I praise you because I am fearfully and wonderfully made.', reference: 'Psalm 139:14' },
  { verse_text: 'Suffering produces perseverance, perseverance produces character, and character produces hope.', reference: 'Romans 5:3-4' },
  { verse_text: 'Consider it pure joy whenever you face trials, for testing produces perseverance.', reference: 'James 1:2-3' },
  { verse_text: 'Walk with the wise and become wise.', reference: 'Proverbs 13:20' },
  { verse_text: 'Be strong and do not give up, for your work will be rewarded.', reference: '2 Chronicles 15:7' },
  { verse_text: 'The Lord is my strength; He makes my feet like the feet of a deer.', reference: 'Habakkuk 3:19' },
  { verse_text: 'I will instruct you and teach you in the way you should go.', reference: 'Psalm 32:8' },
  { verse_text: 'Wisdom is the principal thing; get wisdom.', reference: 'Proverbs 4:7' },
  { verse_text: 'The Lord your God is with you; He will rejoice over you with gladness.', reference: 'Zephaniah 3:17' },
  { verse_text: 'Act justly, love mercy, and walk humbly with your God.', reference: 'Micah 6:8' },
  { verse_text: 'God is the strength of my heart and my portion forever.', reference: 'Psalm 73:26' },
  { verse_text: 'In their hearts humans plan their course, but the Lord establishes their steps.', reference: 'Proverbs 16:9' },
  { verse_text: 'God is able to do immeasurably more than all we ask or imagine.', reference: 'Ephesians 3:20' },
  { verse_text: 'Whatever you do, whether in word or deed, do it in the name of the Lord.', reference: 'Colossians 3:17' },
  { verse_text: 'Whoever delights in the law of the Lord is like a tree planted by streams of water.', reference: 'Psalm 1:2-3' },
  { verse_text: 'Where there is no guidance a people falls, but in an abundance of counselors there is safety.', reference: 'Proverbs 11:14' },
  { verse_text: 'Your ears shall hear a word behind you, saying, this is the way, walk in it.', reference: 'Isaiah 30:21' },
  { verse_text: 'We are hard pressed on every side, but not crushed; perplexed, but not in despair.', reference: '2 Corinthians 4:8-9' },
  { verse_text: 'The Lord will fulfill His purpose for me.', reference: 'Psalm 138:8' },
  { verse_text: 'All hard work brings a profit, but mere talk leads only to poverty.', reference: 'Proverbs 14:23' },
  { verse_text: 'If God is for us, who can be against us?', reference: 'Romans 8:31' },
  { verse_text: 'Always give yourselves fully to the work of the Lord, knowing your labor is not in vain.', reference: '1 Corinthians 15:58' },
  { verse_text: 'Show me your ways, Lord, teach me your paths.', reference: 'Psalm 25:4' },
  { verse_text: 'Listen to advice and accept discipline, and at the end you will be counted among the wise.', reference: 'Proverbs 19:20' },
  { verse_text: 'Let us run with perseverance the race marked out for us.', reference: 'Hebrews 12:1' },
  { verse_text: 'The Lord will keep you from all harm; He will watch over your life.', reference: 'Psalm 121:7-8' },
  { verse_text: 'Blessed are those who find wisdom, those who gain understanding.', reference: 'Proverbs 3:13' },
  { verse_text: 'Ask and it will be given to you; seek and you will find.', reference: 'Matthew 7:7' },
  { verse_text: 'My thoughts are not your thoughts, neither are your ways my ways, declares the Lord.', reference: 'Isaiah 55:8' },
  { verse_text: 'Truly my soul finds rest in God; my salvation comes from Him.', reference: 'Psalm 62:1' },
  { verse_text: 'A person\u2019s steps are directed by the Lord.', reference: 'Proverbs 20:24' },
  { verse_text: 'Whatever your hand finds to do, do it with all your might.', reference: 'Ecclesiastes 9:10' },
  { verse_text: 'In this world you will have trouble. But take heart! I have overcome the world.', reference: 'John 16:33' },
  { verse_text: 'No good thing does He withhold from those whose walk is blameless.', reference: 'Psalm 84:11' },
  { verse_text: 'The Lord gives wisdom; from His mouth come knowledge and understanding.', reference: 'Proverbs 2:6' },
  { verse_text: 'Be joyful in hope, patient in affliction, faithful in prayer.', reference: 'Romans 12:12' },
  { verse_text: 'Show me the way I should go, for to you I entrust my life.', reference: 'Psalm 143:8' },
  { verse_text: 'Carry each other\u2019s burdens, and in this way you will fulfill the law of Christ.', reference: 'Galatians 6:2' },
  { verse_text: 'Where there is no vision, the people perish.', reference: 'Proverbs 29:18' },
  { verse_text: 'No weapon forged against you will prevail.', reference: 'Isaiah 54:17' },
  { verse_text: 'Perfect love drives out fear.', reference: '1 John 4:18' },
  { verse_text: 'Be still, and know that I am God.', reference: 'Psalm 46:10' },
  { verse_text: 'Go to the ant, consider its ways, and be wise.', reference: 'Proverbs 6:6' },
  { verse_text: 'Whatever is true, whatever is noble, whatever is right, think about such things.', reference: 'Philippians 4:8' },
  { verse_text: 'I have fought the good fight, I have finished the race, I have kept the faith.', reference: '2 Timothy 4:7' },
  { verse_text: 'He will wipe every tear from their eyes; there will be no more death or mourning.', reference: 'Revelation 21:4' }
];

// 100 quotes, matching the verse count so both feeds run on the same
// 100-day cycle before repeating.
const motivationalQuotes = [
  { quote_text: 'Success is the sum of small efforts repeated day in and day out.', author: 'Robert Collier' },
  { quote_text: 'The expert in anything was once a beginner.', author: 'Helen Hayes' },
  { quote_text: 'Discipline is choosing between what you want now and what you want most.', author: 'Abraham Lincoln' },
  { quote_text: 'Don\u2019t watch the clock; do what it does. Keep going.', author: 'Sam Levenson' },
  { quote_text: 'It always seems impossible until it\u2019s done.', author: 'Nelson Mandela' },
  { quote_text: 'The future belongs to those who believe in the beauty of their dreams.', author: 'Eleanor Roosevelt' },
  { quote_text: 'It does not matter how slowly you go as long as you do not stop.', author: 'Confucius' },
  { quote_text: 'Believe you can and you\u2019re halfway there.', author: 'Theodore Roosevelt' },
  { quote_text: 'Success is not final, failure is not fatal: it is the courage to continue that counts.', author: 'Winston Churchill' },
  { quote_text: 'The only way to do great work is to love what you do.', author: 'Steve Jobs' },
  { quote_text: 'Education is the most powerful weapon which you can use to change the world.', author: 'Nelson Mandela' },
  { quote_text: 'The beautiful thing about learning is that no one can take it away from you.', author: 'B.B. King' },
  { quote_text: 'Whether you think you can or you think you can\u2019t, you\u2019re right.', author: 'Henry Ford' },
  { quote_text: 'The secret of getting ahead is getting started.', author: 'Mark Twain' },
  { quote_text: 'Don\u2019t let what you cannot do interfere with what you can do.', author: 'John Wooden' },
  { quote_text: 'Hard work beats talent when talent doesn\u2019t work hard.', author: 'Tim Notke' },
  { quote_text: 'You are never too old to set another goal or to dream a new dream.', author: 'C.S. Lewis' },
  { quote_text: 'Opportunities don\u2019t happen, you create them.', author: 'Chris Grosser' },
  { quote_text: 'The way to get started is to quit talking and begin doing.', author: 'Walt Disney' },
  { quote_text: 'Perseverance is not a long race; it is many short races one after the other.', author: 'Walter Elliot' },
  { quote_text: 'Success usually comes to those who are too busy to be looking for it.', author: 'Henry David Thoreau' },
  { quote_text: 'A person who never made a mistake never tried anything new.', author: 'Albert Einstein' },
  { quote_text: 'In the middle of difficulty lies opportunity.', author: 'Albert Einstein' },
  { quote_text: 'Do what you can, with what you have, where you are.', author: 'Theodore Roosevelt' },
  { quote_text: 'The only limit to our realization of tomorrow is our doubts of today.', author: 'Franklin D. Roosevelt' },
  { quote_text: 'Push yourself, because no one else is going to do it for you.', author: null },
  { quote_text: 'Great things never come from comfort zones.', author: null },
  { quote_text: 'Dream it. Wish it. Do it.', author: null },
  { quote_text: 'Success doesn\u2019t just find you; you have to go out and get it.', author: null },
  { quote_text: 'The harder you work for something, the greater you\u2019ll feel when you achieve it.', author: null },
  { quote_text: 'Dream bigger. Do bigger.', author: null },
  { quote_text: 'Don\u2019t stop when you\u2019re tired, stop when you\u2019re done.', author: null },
  { quote_text: 'Wake up with determination, go to bed with satisfaction.', author: null },
  { quote_text: 'Little things make big days.', author: null },
  { quote_text: 'It\u2019s going to be hard, but hard does not mean impossible.', author: null },
  { quote_text: 'Don\u2019t wait for opportunity. Create it.', author: null },
  { quote_text: 'Sometimes we\u2019re tested not to show our weaknesses, but to discover our strengths.', author: null },
  { quote_text: 'The key to success is to focus on goals, not obstacles.', author: null },
  { quote_text: 'Study while others are sleeping; work while others are loafing.', author: 'William Arthur Ward' },
  { quote_text: 'You don\u2019t have to be great to start, but you have to start to be great.', author: 'Zig Ziglar' },
  { quote_text: 'The only place where success comes before work is in the dictionary.', author: 'Vidal Sassoon' },
  { quote_text: 'Do the best you can until you know better. Then when you know better, do better.', author: 'Maya Angelou' },
  { quote_text: 'There are no shortcuts to any place worth going.', author: 'Beverly Sills' },
  { quote_text: 'The only impossible journey is the one you never begin.', author: 'Tony Robbins' },
  { quote_text: 'Motivation is what gets you started. Habit is what keeps you going.', author: 'Jim Ryun' },
  { quote_text: 'A goal without a plan is just a wish.', author: 'Antoine de Saint-Exup\u00e9ry' },
  { quote_text: 'Excellence is not a skill, it\u2019s an attitude.', author: 'Ralph Marston' },
  { quote_text: 'Your limitation\u2014it\u2019s only your imagination.', author: null },
  { quote_text: 'Great things take time.', author: null },
  { quote_text: 'The expert was once a novice who never gave up.', author: null },
  { quote_text: 'Focus on your goal. Don\u2019t look in any direction but ahead.', author: null },
  { quote_text: 'Set your goals high, and don\u2019t stop till you get there.', author: 'Bo Jackson' },
  { quote_text: 'I never dreamed about success. I worked for it.', author: 'Est\u00e9e Lauder' },
  { quote_text: 'Winners are not people who never fail, but people who never quit.', author: null },
  { quote_text: 'The difference between ordinary and extraordinary is that little extra.', author: 'Jimmy Johnson' },
  { quote_text: 'It\u2019s not whether you get knocked down, it\u2019s whether you get up.', author: 'Vince Lombardi' },
  { quote_text: 'The pain of discipline is far less than the pain of regret.', author: null },
  { quote_text: 'Do something today that your future self will thank you for.', author: 'Sean Patrick Flanery' },
  { quote_text: 'You are capable of more than you know.', author: null },
  { quote_text: 'Success is walking from failure to failure with no loss of enthusiasm.', author: 'Winston Churchill' },
  { quote_text: 'Nothing will work unless you do.', author: 'Maya Angelou' },
  { quote_text: 'Believe in yourself and all that you are.', author: 'Christian D. Larson' },
  { quote_text: 'What you get by achieving your goals is not as important as what you become by achieving your goals.', author: 'Zig Ziglar' },
  { quote_text: 'Learning never exhausts the mind.', author: 'Leonardo da Vinci' },
  { quote_text: 'Live as if you were to die tomorrow. Learn as if you were to live forever.', author: 'Mahatma Gandhi' },
  { quote_text: 'An investment in knowledge pays the best interest.', author: 'Benjamin Franklin' },
  { quote_text: 'Change your thoughts and you change your world.', author: 'Norman Vincent Peale' },
  { quote_text: 'The mind is not a vessel to be filled, but a fire to be kindled.', author: 'Plutarch' },
  { quote_text: 'Knowledge is power.', author: 'Francis Bacon' },
  { quote_text: 'Formal education will make you a living; self-education will make you a fortune.', author: 'Jim Rohn' },
  { quote_text: 'Genius is one percent inspiration and ninety-nine percent perspiration.', author: 'Thomas Edison' },
  { quote_text: 'Do not wait to strike till the iron is hot, but make it hot by striking.', author: 'William Butler Yeats' },
  { quote_text: 'Try not to become a person of success, but rather try to become a person of value.', author: 'Albert Einstein' },
  { quote_text: 'You miss 100% of the shots you don\u2019t take.', author: 'Wayne Gretzky' },
  { quote_text: 'The best way to predict the future is to create it.', author: 'Peter Drucker' },
  { quote_text: 'If you want to lift yourself up, lift up someone else.', author: 'Booker T. Washington' },
  { quote_text: 'I am not a product of my circumstances. I am a product of my decisions.', author: 'Stephen Covey' },
  { quote_text: 'Whatever the mind can conceive and believe, it can achieve.', author: 'Napoleon Hill' },
  { quote_text: 'Don\u2019t let yesterday take up too much of today.', author: 'Will Rogers' },
  { quote_text: 'You learn more from failure than from success.', author: null },
  { quote_text: 'It\u2019s not about ideas. It\u2019s about making ideas happen.', author: 'Scott Belsky' },
  { quote_text: 'The road to success and the road to failure are almost exactly the same.', author: 'Colin R. Davis' },
  { quote_text: 'Just when the caterpillar thought the world was over, it became a butterfly.', author: null },
  { quote_text: 'If you can dream it, you can do it.', author: 'Walt Disney' },
  { quote_text: 'Start where you are. Use what you have. Do what you can.', author: 'Arthur Ashe' },
  { quote_text: 'I find that the harder I work, the more luck I seem to have.', author: 'Thomas Jefferson' },
  { quote_text: 'You are your only limit.', author: null },
  { quote_text: 'Not all storms come to disrupt your life; some come to clear your path.', author: null },
  { quote_text: 'Difficult roads often lead to beautiful destinations.', author: null },
  { quote_text: 'Small steps every day add up to big change.', author: null },
  { quote_text: 'One day or day one. You decide.', author: null },
  { quote_text: 'Work hard in silence, let your success be your noise.', author: 'Frank Ocean' },
  { quote_text: 'There is no substitute for hard work.', author: 'Thomas Edison' },
  { quote_text: 'Champions keep playing until they get it right.', author: 'Billie Jean King' },
  { quote_text: 'Don\u2019t limit your challenges, challenge your limits.', author: null },
  { quote_text: 'A river cuts through rock, not because of its power, but its persistence.', author: 'Jim Watkins' },
  { quote_text: 'Success is not how high you climb, but how you make a positive difference.', author: 'Roy T. Bennett' },
  { quote_text: 'You are stronger than you think.', author: null },
  { quote_text: 'Fall seven times, stand up eight.', author: 'Japanese Proverb' },
  { quote_text: 'Consistency is what transforms average into excellence.', author: null }
];

async function seed() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env and add your Supabase connection string.');
    process.exit(1);
  }

  let client;
  try {
    console.log('Connecting to database...');
    client = await pool.connect();
    console.log('Connected. Starting seed...');

    console.log('Seeding announcements...');
    await client.query('DELETE FROM announcements');
    for (const a of announcements) {
      await client.query(
        `INSERT INTO announcements (title, content, category) VALUES ($1, $2, $3)`,
        [a.title, a.content, a.category]
      );
    }

    console.log('Seeding HELB / scholarship / bursary updates...');
    await client.query('DELETE FROM helb_updates');
    for (const h of helbUpdates) {
      await client.query(
        `INSERT INTO helb_updates (title, content, update_type) VALUES ($1, $2, $3)`,
        [h.title, h.content, h.update_type]
      );
    }

    console.log('Seeding opportunities...');
    await client.query('DELETE FROM opportunities');
    for (const o of opportunities) {
      await client.query(
        `INSERT INTO opportunities (title, description, opportunity_type, organization, link, deadline)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [o.title, o.description, o.opportunity_type, o.organization, o.link, o.deadline]
      );
    }

    console.log('Seeding bible verses (one per day, rotating)...');
    await client.query('DELETE FROM bible_verses');
    for (let i = 0; i < bibleVerses.length; i++) {
      const v = bibleVerses[i];
      await client.query(
        `INSERT INTO bible_verses (verse_text, reference, date_assigned) VALUES ($1, $2, CURRENT_DATE + $3::int)`,
        [v.verse_text, v.reference, i]
      );
    }

    console.log('Seeding motivational quotes (one per day, rotating)...');
    await client.query('DELETE FROM motivational_quotes');
    for (let i = 0; i < motivationalQuotes.length; i++) {
      const q = motivationalQuotes[i];
      await client.query(
        `INSERT INTO motivational_quotes (quote_text, author, date_assigned) VALUES ($1, $2, CURRENT_DATE + $3::int)`,
        [q.quote_text, q.author, i]
      );
    }

    console.log('Seed complete. All admin-managed sections now have starter content.');
    console.log('Log in as admin and edit/add/delete any of this from the admin panel at any time.');
  } catch (err) {
    console.error('Seeding failed:', err.message);
    process.exitCode = 1;
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('Unexpected error while seeding:', err);
  process.exit(1);
});