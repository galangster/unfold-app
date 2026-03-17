/**
 * Red Letter Verses — Words of Jesus Christ
 *
 * Comprehensive verse-level dataset of every verse where Jesus speaks directly
 * in the Bible. Covers all four Gospels (Matthew, Mark, Luke, John), Acts, and Revelation.
 *
 * Book IDs (OSIS): Matthew=40, Mark=41, Luke=42, John=43, Acts=44, Revelation=66
 *
 * Based on the Berean Standard Bible (BSB) verse numbering and red-letter formatting.
 * Following standard red-letter Bible convention: entire parables told by Jesus are
 * included as red letter (since Jesus is the speaker), even when characters within
 * the parable have dialogue. Verses where Jesus's speech begins or ends mid-verse
 * are included.
 *
 * Sources cross-referenced: BSB (biblestudytools.com), CCEL Phillips red-letter edition,
 * redlettertext.com (KJV), zoraweb.com (John).
 *
 * Format: Set of "bookId:chapter:verse" strings for O(1) lookup.
 */

// Helper to generate verse ranges
function range(bookId: number, chapter: number, start: number, end: number): string[] {
  const result: string[] = [];
  for (let v = start; v <= end; v++) {
    result.push(`${bookId}:${chapter}:${v}`);
  }
  return result;
}

// ─── Matthew (bookId: 40) ────────────────────────────────────────────────────
const MATTHEW = [
  // Ch 3 — Baptism
  '40:3:15',

  // Ch 4 — Temptation, calling disciples
  '40:4:4', '40:4:7', '40:4:10', '40:4:17', '40:4:19',

  // Ch 5 — Sermon on the Mount (Beatitudes through end)
  ...range(40, 5, 3, 48),

  // Ch 6 — Sermon on the Mount continued (giving, prayer, fasting, treasures, worry)
  ...range(40, 6, 1, 34),

  // Ch 7 — Sermon on the Mount concluded (judging, ask/seek/knock, golden rule, two gates, tree/fruit, wise builder)
  ...range(40, 7, 1, 27),

  // Ch 8 — Healings and authority
  '40:8:3', '40:8:4', '40:8:7', ...range(40, 8, 10, 13),
  '40:8:20', '40:8:22', '40:8:26', '40:8:32',

  // Ch 9 — Healings, calling Matthew, fasting, faith
  '40:9:2', ...range(40, 9, 4, 6), '40:9:9', '40:9:12', '40:9:13',
  '40:9:15', '40:9:16', '40:9:17', '40:9:22', '40:9:24',
  '40:9:28', '40:9:29', '40:9:30', ...range(40, 9, 37, 38),

  // Ch 10 — Commissioning the Twelve
  ...range(40, 10, 5, 42),

  // Ch 11 — Jesus and John the Baptist, woes, rest for the weary
  ...range(40, 11, 4, 6), ...range(40, 11, 7, 19),
  ...range(40, 11, 21, 24), ...range(40, 11, 25, 30),

  // Ch 12 — Lord of the Sabbath, Beelzebul, sign of Jonah, true family
  ...range(40, 12, 3, 8), ...range(40, 12, 11, 13),
  ...range(40, 12, 25, 37), ...range(40, 12, 39, 45),
  ...range(40, 12, 48, 50),

  // Ch 13 — Parables (sower, wheat/tares, mustard seed, leaven, treasure, pearl, net)
  ...range(40, 13, 3, 9), ...range(40, 13, 11, 23),
  ...range(40, 13, 24, 33), ...range(40, 13, 37, 52),
  '40:13:57',

  // Ch 14 — Feeding 5000, walking on water
  '40:14:16', '40:14:18', '40:14:27', '40:14:29', '40:14:31',

  // Ch 15 — Traditions, Canaanite woman, feeding 4000
  ...range(40, 15, 3, 11), '40:15:13', '40:15:14',
  ...range(40, 15, 16, 20), '40:15:24', '40:15:26', '40:15:28',
  '40:15:32', '40:15:34',

  // Ch 16 — Yeast of Pharisees, Peter's confession, passion prediction, take up cross
  ...range(40, 16, 2, 4), '40:16:6', ...range(40, 16, 8, 12),
  '40:16:15', ...range(40, 16, 17, 20), '40:16:23',
  ...range(40, 16, 24, 28),

  // Ch 17 — Transfiguration, demon-possessed boy, temple tax
  '40:17:7', '40:17:9', '40:17:11', '40:17:12',
  '40:17:17', '40:17:20', '40:17:22', '40:17:23',
  ...range(40, 17, 25, 27),

  // Ch 18 — Greatest in kingdom, lost sheep, brother who sins, unforgiving servant
  ...range(40, 18, 3, 35),

  // Ch 19 — Divorce, children, rich young man, rewards
  ...range(40, 19, 4, 6), '40:19:8', '40:19:9',
  '40:19:11', '40:19:12', '40:19:14',
  ...range(40, 19, 17, 21), ...range(40, 19, 23, 26),
  ...range(40, 19, 28, 30),

  // Ch 20 — Parable of workers in vineyard, passion prediction, request of James/John, blind men
  ...range(40, 20, 1, 16), '40:20:18', '40:20:19',
  '40:20:22', '40:20:23', ...range(40, 20, 25, 28),
  '40:20:32',

  // Ch 21 — Triumphal entry, fig tree, temple, parables
  '40:21:2', '40:21:3', '40:21:13', '40:21:16', '40:21:19',
  '40:21:21', '40:21:22', '40:21:24', '40:21:25',
  '40:21:27', ...range(40, 21, 28, 32),
  ...range(40, 21, 33, 44),

  // Ch 22 — Wedding banquet, paying taxes, resurrection, greatest commandment, whose son
  ...range(40, 22, 2, 14), '40:22:18', '40:22:19',
  '40:22:20', '40:22:21',
  ...range(40, 22, 29, 32), ...range(40, 22, 37, 40),
  ...range(40, 22, 42, 45),

  // Ch 23 — Woes to scribes and Pharisees, lament over Jerusalem
  ...range(40, 23, 2, 39),

  // Ch 24 — Olivet Discourse (signs, end times, coming of Son of Man, readiness)
  '40:24:2', ...range(40, 24, 4, 51),

  // Ch 25 — Parables (ten virgins, talents, sheep and goats)
  ...range(40, 25, 1, 13), '40:25:14', '40:25:15',
  ...range(40, 25, 19, 30), ...range(40, 25, 31, 46),

  // Ch 26 — Passion week (anointing, Last Supper, Gethsemane, arrest, trial)
  '40:26:2', ...range(40, 26, 10, 13), '40:26:18',
  '40:26:21', '40:26:23', '40:26:24', '40:26:25',
  ...range(40, 26, 26, 29), '40:26:31', '40:26:32',
  '40:26:34', '40:26:36', '40:26:38', '40:26:39',
  '40:26:40', '40:26:41', '40:26:42', '40:26:44',
  '40:26:45', '40:26:46', '40:26:50',
  ...range(40, 26, 52, 56), '40:26:64',

  // Ch 27 — Trial and crucifixion
  '40:27:11', '40:27:46',

  // Ch 28 — Resurrection, Great Commission
  '40:28:9', '40:28:10', ...range(40, 28, 18, 20),
];

// ─── Mark (bookId: 41) ──────────────────────────────────────────────────────
const MARK = [
  // Ch 1 — Beginning of ministry, calling disciples, healings
  '41:1:15', '41:1:17', '41:1:25', '41:1:38', '41:1:41', '41:1:44',

  // Ch 2 — Paralytic, calling Levi, fasting, Sabbath
  '41:2:5', ...range(41, 2, 8, 11), '41:2:14', '41:2:17',
  '41:2:19', '41:2:20', '41:2:25', '41:2:27', '41:2:28',

  // Ch 3 — Healing on Sabbath, Beelzebul, true family
  '41:3:3', '41:3:4', '41:3:5',
  ...range(41, 3, 23, 29), '41:3:33', '41:3:34', '41:3:35',

  // Ch 4 — Parables (sower, lamp, growing seed, mustard seed), calming the storm
  ...range(41, 4, 3, 9), ...range(41, 4, 11, 25),
  ...range(41, 4, 26, 32), '41:4:35', '41:4:39', '41:4:40',

  // Ch 5 — Gerasene demoniac, Jairus's daughter, bleeding woman
  '41:5:8', '41:5:9', '41:5:19', '41:5:30', '41:5:34',
  '41:5:36', '41:5:39', '41:5:41',

  // Ch 6 — Rejection at Nazareth, sending the Twelve, feeding 5000, walking on water
  '41:6:4', ...range(41, 6, 8, 11),
  '41:6:31', '41:6:37', '41:6:38', '41:6:39', '41:6:50',

  // Ch 7 — Traditions, Syrophoenician woman, deaf man healed
  ...range(41, 7, 6, 9), ...range(41, 7, 14, 15),
  ...range(41, 7, 18, 23), '41:7:27', '41:7:29', '41:7:34',

  // Ch 8 — Feeding 4000, yeast of Pharisees, blind man, Peter's confession, passion prediction
  '41:8:1', '41:8:2', '41:8:3', '41:8:5', '41:8:12', '41:8:15',
  ...range(41, 8, 17, 21), '41:8:23', '41:8:25', '41:8:26',
  '41:8:27', '41:8:29', '41:8:31', '41:8:33',
  ...range(41, 8, 34, 38),

  // Ch 9 — Transfiguration, demon-possessed boy, passion prediction, greatest, salt
  '41:9:1', '41:9:9', '41:9:12', '41:9:13', '41:9:16', '41:9:19',
  '41:9:23', '41:9:25', '41:9:29', '41:9:31', '41:9:35',
  '41:9:37', '41:9:39', '41:9:40', '41:9:41',
  ...range(41, 9, 43, 50),

  // Ch 10 — Divorce, children, rich man, passion prediction, James and John, Bartimaeus
  '41:10:3', ...range(41, 10, 5, 9), '41:10:11', '41:10:12',
  '41:10:14', '41:10:15', ...range(41, 10, 18, 21),
  '41:10:23', '41:10:24', '41:10:25', '41:10:27',
  '41:10:29', '41:10:30', '41:10:31',
  '41:10:33', '41:10:34', '41:10:36', '41:10:38',
  '41:10:39', '41:10:40', ...range(41, 10, 42, 45),
  '41:10:49', '41:10:51', '41:10:52',

  // Ch 11 — Triumphal entry, fig tree cursed, temple cleansed, faith and prayer
  '41:11:2', '41:11:3', '41:11:14', '41:11:17',
  ...range(41, 11, 22, 25), '41:11:29', '41:11:30', '41:11:33',

  // Ch 12 — Parable of tenants, taxes to Caesar, resurrection, greatest commandment, widow's mite
  ...range(41, 12, 1, 11), '41:12:15', '41:12:16', '41:12:17',
  ...range(41, 12, 24, 27), ...range(41, 12, 29, 31),
  '41:12:34', ...range(41, 12, 35, 40),
  '41:12:43', '41:12:44',

  // Ch 13 — Olivet Discourse
  '41:13:2', ...range(41, 13, 5, 37),

  // Ch 14 — Anointing, Last Supper, Gethsemane, arrest, trial
  '41:14:6', '41:14:7', '41:14:8', '41:14:18', '41:14:20',
  '41:14:21', '41:14:22', '41:14:24', '41:14:25',
  '41:14:27', '41:14:28', '41:14:30',
  '41:14:34', '41:14:36', '41:14:37', '41:14:38',
  '41:14:41', '41:14:42', '41:14:48', '41:14:49',
  '41:14:62',

  // Ch 15 — Trial and crucifixion
  '41:15:2', '41:15:34',

  // Ch 16 — Resurrection, Great Commission
  ...range(41, 16, 15, 18),
];

// ─── Luke (bookId: 42) ──────────────────────────────────────────────────────
const LUKE = [
  // Ch 2 — Boy Jesus at the temple
  '42:2:49',

  // Ch 4 — Temptation, Nazareth synagogue, ministry begins
  '42:4:4', '42:4:8', '42:4:12',
  '42:4:21', '42:4:23', '42:4:24',
  ...range(42, 4, 25, 27), '42:4:35', '42:4:43',

  // Ch 5 — Calling disciples, healings, Levi, fasting
  '42:5:4', '42:5:10', '42:5:13',
  '42:5:20', ...range(42, 5, 22, 24), '42:5:27',
  '42:5:31', '42:5:32', '42:5:34', '42:5:35',

  // Ch 6 — Sabbath, Beatitudes, love your enemies, judging, wise builder
  '42:6:3', '42:6:4', '42:6:5', '42:6:8', '42:6:9', '42:6:10',
  ...range(42, 6, 20, 49),

  // Ch 7 — Centurion's servant, widow's son, John the Baptist, sinful woman
  '42:7:9', '42:7:13', '42:7:14',
  ...range(42, 7, 22, 28), ...range(42, 7, 31, 35),
  '42:7:40', ...range(42, 7, 43, 48), '42:7:50',

  // Ch 8 — Parable of sower, lamp, true family, calming storm, Gerasene demoniac, Jairus/bleeding woman
  ...range(42, 8, 5, 8), '42:8:10', ...range(42, 8, 11, 18),
  '42:8:21', '42:8:22', '42:8:25',
  '42:8:30', '42:8:39', '42:8:45', '42:8:46', '42:8:48',
  '42:8:50', '42:8:52', '42:8:54',

  // Ch 9 — Sending the Twelve, feeding 5000, Peter's confession, transfiguration, cost of discipleship
  '42:9:2', '42:9:3', '42:9:5', '42:9:9',
  '42:9:13', '42:9:14', '42:9:16', '42:9:20',
  ...range(42, 9, 22, 27), '42:9:41', '42:9:44',
  '42:9:48', '42:9:50', '42:9:58', '42:9:60', '42:9:62',

  // Ch 10 — Sending the 72, woes, Good Samaritan, Mary and Martha
  ...range(42, 10, 2, 12), '42:10:16',
  ...range(42, 10, 18, 24), '42:10:26', '42:10:28',
  ...range(42, 10, 30, 37), '42:10:41', '42:10:42',

  // Ch 11 — Lord's Prayer, persistent friend, Beelzebul, sign of Jonah, woes
  ...range(42, 11, 2, 13), ...range(42, 11, 17, 26),
  '42:11:28', ...range(42, 11, 29, 36),
  ...range(42, 11, 39, 52),

  // Ch 12 — Hypocrisy, fear God, rich fool, do not worry, watchfulness, division
  ...range(42, 12, 1, 12), '42:12:14', '42:12:15',
  ...range(42, 12, 16, 21), ...range(42, 12, 22, 40),
  ...range(42, 12, 42, 53), ...range(42, 12, 54, 59),

  // Ch 13 — Repent or perish, barren fig tree, healing on Sabbath, narrow door, lament over Jerusalem
  ...range(42, 13, 2, 9), '42:13:12', '42:13:15', '42:13:16',
  ...range(42, 13, 18, 21), ...range(42, 13, 23, 30),
  '42:13:32', '42:13:33', '42:13:34', '42:13:35',

  // Ch 14 — Healing on Sabbath, humility, cost of discipleship, salt
  '42:14:3', '42:14:4', '42:14:5',
  ...range(42, 14, 8, 14), ...range(42, 14, 16, 24),
  ...range(42, 14, 26, 35),

  // Ch 15 — Parables of the lost (sheep, coin, prodigal son)
  ...range(42, 15, 3, 10), ...range(42, 15, 11, 32),

  // Ch 16 — Shrewd manager, rich man and Lazarus
  ...range(42, 16, 1, 13), '42:16:15', '42:16:16',
  '42:16:17', '42:16:18', ...range(42, 16, 19, 31),

  // Ch 17 — Sin, faith, ten lepers, coming of the kingdom
  ...range(42, 17, 1, 4), '42:17:6', ...range(42, 17, 7, 10),
  '42:17:14', '42:17:17', '42:17:19',
  '42:17:20', '42:17:21', ...range(42, 17, 22, 37),

  // Ch 18 — Persistent widow, Pharisee and tax collector, children, rich ruler, passion prediction, blind beggar
  '42:18:1', ...range(42, 18, 2, 8), '42:18:9',
  '42:18:14', '42:18:16', '42:18:17',
  '42:18:19', '42:18:20', '42:18:22',
  '42:18:24', '42:18:25', '42:18:27',
  '42:18:29', '42:18:31', '42:18:32', '42:18:33',
  '42:18:40', '42:18:41', '42:18:42',

  // Ch 19 — Zacchaeus, parable of ten minas, triumphal entry, cleansing temple
  '42:19:5', '42:19:9', '42:19:10',
  ...range(42, 19, 12, 27),
  '42:19:30', '42:19:31', '42:19:40',
  '42:19:42', '42:19:43', '42:19:44', '42:19:46',

  // Ch 20 — Authority questioned, parable of tenants, taxes, resurrection, David's son
  '42:20:3', '42:20:4', '42:20:8',
  ...range(42, 20, 13, 18), ...range(42, 20, 23, 25),
  ...range(42, 20, 34, 38), ...range(42, 20, 41, 44),

  // Ch 21 — Widow's offering, Olivet Discourse
  '42:21:3', '42:21:4', ...range(42, 21, 6, 36),

  // Ch 22 — Last Supper, Gethsemane, arrest, trial
  '42:22:8', '42:22:10', '42:22:11',
  ...range(42, 22, 15, 22),
  ...range(42, 22, 25, 38),
  '42:22:40', '42:22:42', '42:22:46',
  '42:22:48', '42:22:51', '42:22:52', '42:22:53',
  '42:22:67', '42:22:68', '42:22:69', '42:22:70',

  // Ch 23 — Trial, crucifixion
  '42:23:3', ...range(42, 23, 28, 31),
  '42:23:34', '42:23:43', '42:23:46',

  // Ch 24 — Resurrection, road to Emmaus, appearances, ascension
  '42:24:17', ...range(42, 24, 25, 27),
  '42:24:36', ...range(42, 24, 38, 39),
  '42:24:41', '42:24:44', ...range(42, 24, 46, 49),
];

// ─── John (bookId: 43) ──────────────────────────────────────────────────────
const JOHN = [
  // Ch 1 — Calling disciples
  '43:1:38', '43:1:39', '43:1:42', '43:1:43',
  '43:1:47', '43:1:48', '43:1:50', '43:1:51',

  // Ch 2 — Wedding at Cana, temple cleansing
  '43:2:4', '43:2:7', '43:2:8', '43:2:16', '43:2:19',

  // Ch 3 — Nicodemus (Jesus's speech extends through v21 in most red-letter editions)
  ...range(43, 3, 3, 8), ...range(43, 3, 10, 21),

  // Ch 4 — Samaritan woman, royal official
  '43:4:7', '43:4:10', '43:4:13', '43:4:14',
  '43:4:16', '43:4:17', '43:4:18',
  ...range(43, 4, 21, 26),
  '43:4:32', '43:4:34', '43:4:35', '43:4:36', '43:4:37', '43:4:38',
  '43:4:48', '43:4:50',

  // Ch 5 — Pool of Bethesda, authority of the Son
  '43:5:6', '43:5:8', '43:5:14', '43:5:17',
  ...range(43, 5, 19, 47),

  // Ch 6 — Feeding 5000, walking on water, Bread of Life
  '43:6:5', '43:6:10', '43:6:12', '43:6:20',
  '43:6:26', '43:6:27', '43:6:29',
  ...range(43, 6, 32, 40), ...range(43, 6, 43, 51),
  ...range(43, 6, 53, 58),
  ...range(43, 6, 61, 65), '43:6:67', '43:6:70',

  // Ch 7 — Feast of Tabernacles
  ...range(43, 7, 6, 8), ...range(43, 7, 16, 19),
  '43:7:21', '43:7:23', '43:7:24',
  '43:7:28', '43:7:29', '43:7:33', '43:7:34',
  '43:7:37', '43:7:38',

  // Ch 8 — Woman caught in adultery, Light of the World, Abraham's children
  '43:8:7', '43:8:10', '43:8:11', '43:8:12',
  ...range(43, 8, 14, 19), '43:8:21',
  ...range(43, 8, 23, 26), '43:8:28', '43:8:29',
  '43:8:31', '43:8:32', ...range(43, 8, 34, 47),
  ...range(43, 8, 49, 51), '43:8:54', '43:8:55', '43:8:56', '43:8:58',

  // Ch 9 — Man born blind
  '43:9:3', '43:9:4', '43:9:5', '43:9:7',
  '43:9:35', '43:9:37', '43:9:39', '43:9:41',

  // Ch 10 — Good Shepherd, Feast of Dedication
  ...range(43, 10, 1, 18),
  ...range(43, 10, 25, 30), '43:10:32',
  ...range(43, 10, 34, 38),

  // Ch 11 — Lazarus raised
  '43:11:4', '43:11:7', '43:11:9', '43:11:10', '43:11:11',
  '43:11:14', '43:11:15', '43:11:23', '43:11:25', '43:11:26',
  '43:11:34', '43:11:39', '43:11:40',
  '43:11:41', '43:11:42', '43:11:43',

  // Ch 12 — Anointing, triumphal entry, Greeks seek Jesus, voice from heaven
  '43:12:7', '43:12:8', ...range(43, 12, 23, 28),
  ...range(43, 12, 30, 32), '43:12:35', '43:12:36',
  ...range(43, 12, 44, 50),

  // Ch 13 — Washing feet, new commandment, Peter's denial predicted
  '43:13:7', '43:13:8', '43:13:10',
  ...range(43, 13, 12, 20),
  '43:13:21', '43:13:26', '43:13:27',
  ...range(43, 13, 31, 36), '43:13:38',

  // Ch 14 — The Way, Truth, Life; Farewell Discourse
  ...range(43, 14, 1, 4), ...range(43, 14, 6, 7),
  ...range(43, 14, 9, 21), ...range(43, 14, 23, 31),

  // Ch 15 — Vine and branches, world's hatred
  ...range(43, 15, 1, 27),

  // Ch 16 — Holy Spirit, sorrow to joy, peace in tribulation
  ...range(43, 16, 1, 5), ...range(43, 16, 7, 16),
  ...range(43, 16, 19, 28), ...range(43, 16, 31, 33),

  // Ch 17 — High Priestly Prayer
  ...range(43, 17, 1, 26),

  // Ch 18 — Arrest, Peter's denial, before Pilate
  '43:18:4', '43:18:5', '43:18:7', '43:18:8', '43:18:11',
  '43:18:20', '43:18:21', '43:18:23',
  '43:18:34', '43:18:36', '43:18:37',

  // Ch 19 — Crucifixion
  '43:19:11', '43:19:26', '43:19:27', '43:19:28', '43:19:30',

  // Ch 20 — Resurrection appearances
  '43:20:15', '43:20:16', '43:20:17', '43:20:19',
  '43:20:21', '43:20:22', '43:20:23',
  '43:20:26', '43:20:27', '43:20:29',

  // Ch 21 — Appearance at Sea of Galilee, Peter restored
  '43:21:5', '43:21:6', '43:21:10', '43:21:12',
  ...range(43, 21, 15, 19), '43:21:22',
];

// ─── Acts (bookId: 44) ──────────────────────────────────────────────────────
const ACTS = [
  // Ch 1 — Ascension instructions
  '44:1:4', '44:1:5', '44:1:7', '44:1:8',

  // Ch 9 — Damascus road (Saul's conversion), vision to Ananias
  '44:9:4', '44:9:5', '44:9:6', '44:9:10', '44:9:11', '44:9:12',
  '44:9:15', '44:9:16',

  // Ch 18 — Vision to Paul in Corinth
  '44:18:9', '44:18:10',

  // Ch 22 — Paul's testimony (Jesus's words within the account)
  '44:22:7', '44:22:8', '44:22:10', '44:22:18', '44:22:21',

  // Ch 23 — The Lord encourages Paul
  '44:23:11',

  // Ch 26 — Paul before Agrippa (Jesus's words within the account)
  ...range(44, 26, 15, 18),
];

// ─── Revelation (bookId: 66) ────────────────────────────────────────────────
const REVELATION = [
  // Ch 1 — Vision of the risen Christ
  '66:1:11', '66:1:17', '66:1:18', '66:1:19', '66:1:20',

  // Ch 2 — Letters to Ephesus, Smyrna, Pergamum, Thyatira
  ...range(66, 2, 1, 29),

  // Ch 3 — Letters to Sardis, Philadelphia, Laodicea
  ...range(66, 3, 1, 22),

  // Ch 16 — Coming like a thief
  '66:16:15',

  // Ch 21 — All things new
  '66:21:5', '66:21:6', '66:21:7',

  // Ch 22 — I am coming soon
  '66:22:7', '66:22:12', '66:22:13', '66:22:16', '66:22:20',
];

// ─── Build the lookup Set ────────────────────────────────────────────────────

export const RED_LETTER_VERSES = new Set<string>([
  ...MATTHEW,
  ...MARK,
  ...LUKE,
  ...JOHN,
  ...ACTS,
  ...REVELATION,
]);

/**
 * Check if a verse contains Jesus's direct speech (red letter).
 * O(1) lookup time.
 */
export function isRedLetterVerse(bookId: number, chapter: number, verse: number): boolean {
  return RED_LETTER_VERSES.has(`${bookId}:${chapter}:${verse}`);
}
