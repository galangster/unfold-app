# Unfold Companion Chatbot: Scope, Guardrails & Off-Topic Handling Research

**Date**: 2026-03-21
**Purpose**: Comprehensive research to inform Unfold's devotional companion chatbot scope definition, guardrails strategy, and off-topic handling patterns.

---

## Table of Contents
1. [How Faith/Spiritual AI Chatbots Handle Off-Topic Requests](#1-how-faithspiritual-ai-chatbots-handle-off-topic-requests)
2. [How Context-Specific Chatbots Define Their Scope](#2-how-context-specific-chatbots-define-their-scope)
3. [UX Patterns for Scope Boundaries](#3-ux-patterns-for-scope-boundaries)
4. [What a Devotional Companion Should Discuss](#4-what-a-devotional-companion-should-discuss)
5. [The "Therapy vs Companion" Line](#5-the-therapy-vs-companion-line)
6. [System Prompt Engineering for Scope Control](#6-system-prompt-engineering-for-scope-control)
7. [User Expectations and Satisfaction](#7-user-expectations-and-satisfaction)
8. [Legal and Regulatory Landscape](#8-legal-and-regulatory-landscape)
9. [Proposed Scope Tiers Framework for Unfold](#9-proposed-scope-tiers-framework-for-unfold)
10. [Example Responses by Request Type](#10-example-responses-by-request-type)

---

## 1. How Faith/Spiritual AI Chatbots Handle Off-Topic Requests

### Current Landscape (2025-2026)

The faith-tech AI space has exploded. Bible Chat has been downloaded 30M+ times. Hallow reached #1 in Apple's App Store. Faith tech has attracted tens of millions in investment. These apps are built on the same LLMs powering ChatGPT and Gemini, with responses shaped by religious text training data.

### What Existing Apps Do

**Bible Chat / CrossTalk / Faith Mentor pattern**: These apps are trained exclusively on Scripture and developed with guidance from pastors and theologians. They point users to religious doctrine and Scripture to answer questions. When asked something outside scope, most simply don't engage well because their training data is narrow.

**Hallow pattern**: Alex Jones (founder) insists the apps should supplement, not replace, human spiritual connection. Hallow expanded beyond chat to 20,000+ audio sessions covering prayer, meditation, sleep stories, theology, and Bible study. Their scope is broader (spiritual wellness) rather than narrow (Bible Q&A only).

**Text With Jesus / Bible.ai pattern**: These allow more open-ended conversation but face criticism for theological distortion -- blending content from multiple sources including conflicting interpretations and fringe beliefs. They present doctrines without context, historical grounding, or denominational clarity.

**Gamaliel pattern**: Open-source AI Bible reader with theological guardrails rooted in the Nicene Creed. Answers Scripture questions with biblically grounded responses. Explicit doctrinal boundary.

**Tapos App pattern**: Trained on a repository of spiritual and theological teachings of a *particular* church or pastor. Denominational specificity as a feature.

### Key Concern from Religious Leaders

Some warn that AI lacks the spiritual integrity and doctrinal accountability that religious tradition requires. Responses shaped by algorithms rather than faith tradition, spiritual community, or denominational doctrine can lead to "theological misalignment" -- congregants encountering interpretations that clash with their pastor's teaching.

### Key Takeaway for Unfold

The best faith chatbots don't just answer Bible trivia. They are positioned as *companions* within a specific spiritual framework. Unfold's advantage: its companion already has persona, tone, and doctrinal anchoring (Restoration Movement / Church of Christ tradition documented in `unfold_doctrinal_beliefs.md`). Most competitors lack this specificity.

---

## 2. How Context-Specific Chatbots Define Their Scope

### Khanmigo (Khan Academy) -- Education

**The gold standard for scope control in a domain-specific chatbot.**

Khan Academy's 7-step prompt engineering approach includes:
1. Persona definition with specific educational role
2. Socratic method enforcement (never gives direct answers)
3. Subject-specific optimization (separate math/science vs. humanities tutors)
4. Reading-level adaptation (speaks at student's level, no higher than 2nd grade default)
5. Off-topic redirect capability built into the prompt
6. Moderation and monitoring with parent/teacher alerts for flagged content
7. Persona testing across skill levels

**How it handles off-topic**: Khanmigo has "technical guardrails that limit its ability to engage in conversations outside of educational purposes." Conversations are limited to a specific set of activities the team has confidence will work as intended. Narrowing scope is their explicit strategy for limiting risk.

**Crisis handling**: If unsafe, taboo, or inappropriate topics arise, Khanmigo urges users to speak to a trusted adult immediately. Safety takes precedence over lessons. For suicide/self-harm mentions: must provide 988 Suicide & Crisis Lifeline number.

**Off-topic example**: Flirting is flagged as "off-task" (not dangerous, just outside scope). The prompt distinguishes between *harmful* off-topic and *benign* off-topic.

### Woebot (Mental Health)

**Multi-layered safety architecture with generative AI:**

1. **Model selection**: Uses "best in class" LLMs less likely to produce hallucinations
2. **Validation steps surrounding the LLM**: Ensures Woebot won't give an LLM-generated response to an off-topic statement OR a mention of suicidal ideation
3. **Prompt wrapping**: Users' statements wrapped in careful prompts including explicit instructions ("don't provide medical advice") plus examples of appropriate responses

**Off-topic handling**: Woebot detects off-topic statements *before* they reach the LLM. Off-topic inputs get a non-LLM response (presumably a redirect or acknowledgment).

**Key insight**: Woebot treats off-topic detection as a *safety* feature, not just a UX feature. An off-topic statement that gets an LLM response risks hallucination because the model is outside its training context.

### Wysa (Mental Health)

- Designed for people 13+ experiencing low mood, stress, or anxiety
- NOT recommended for crisis situations or severe mental health problems
- Uses open-ended conversation style but explicitly says "I'm not the best help in an emergency"
- Scope is *supportive tools* rather than professional mental health care replacement

### Pi (Inflection AI) -- Personal Companion

**The empathy-first approach:**

Pi was designed with behavioral therapists, psychologists, playwrights, novelists, and comedians. It has "flavors of therapist," "friend," "supernerdy expert," and "coach/confidant."

- Takes 10-30 turns to discern user's mood
- Begins conversations by asking about casual life to build warm, curious vibe
- Retains conversations to build "deeper relationships"
- Does NOT perform actions (no reminders, no documents, no coding)
- Adjusts style based on user mood -- casual to supportive

**Pi's approach to scope**: Rather than hard topic boundaries, Pi defines scope by *function*. It helps you process thoughts and feelings, express yourself, and work through tricky decisions. Topics are less restricted; the *type of help* is restricted.

### Key Takeaway for Unfold

Three viable scope models exist:
1. **Topic-gated** (Khanmigo): Only discuss education. Hard redirect for everything else.
2. **Function-gated** (Pi): Discuss anything, but only through the lens of emotional support/conversation.
3. **Hybrid** (Woebot): Discuss mental health topics freely, but intercept off-topic and crisis before they reach the LLM.

**Recommendation for Unfold: Hybrid approach.** Core spiritual topics get full engagement. Adjacent life topics get engagement through a spiritual lens. Off-topic gets warm redirect. Crisis gets immediate safety response.

---

## 3. UX Patterns for Scope Boundaries

### The Four Redirect Patterns

Based on research across multiple platforms, there are four distinct patterns for handling out-of-scope requests:

#### Pattern 1: Hard Redirect (Robotic)
> "I can only help with Bible questions."

**Pros**: Clear, unambiguous, lowest hallucination risk
**Cons**: Feels cold, users report frustration, breaks conversational flow
**Used by**: Basic customer service bots, low-trust environments
**User reaction**: 59% of users report frustration when chatbots can't serve their needs

#### Pattern 2: Soft Redirect (Warm)
> "That's an interesting question! I'm really at my best when we're exploring spiritual topics together. Is there something on your heart faith-wise I can help with?"

**Pros**: Maintains warmth, preserves relationship, gives clear direction
**Cons**: Can feel deflective if overused
**Used by**: Pi, higher-end companion apps
**User reaction**: Research shows social-oriented communication style chatbots enhance interaction satisfaction

#### Pattern 3: Bridge Redirect (Connecting)
> "I don't know much about calories, but speaking of nourishment -- Jesus said 'Man shall not live by bread alone.' What's feeding your soul lately?"

**Pros**: Creative, keeps conversation going, demonstrates personality
**Cons**: Can feel forced or cringey if poorly executed, risks trivializing the user's actual question
**Used by**: Some faith chatbots attempt this
**User reaction**: Mixed -- clever when natural, annoying when forced

#### Pattern 4: Transparent Redirect (Honest)
> "I'm designed to be your spiritual companion, so I focus on faith and life-through-a-spiritual-lens topics. For calorie counting, a nutrition app would serve you better. But if you're thinking about how your body relates to your spiritual life, I'd love to explore that!"

**Pros**: Builds trust through honesty, suggests alternatives, opens a spiritual door
**Cons**: Slightly longer, requires good judgment about the spiritual door opening
**Used by**: Best-in-class domain-specific bots
**User reaction**: Research shows transparency about limitations *increases* trust

### What Research Says Users Prefer

1. **Warmth over precision**: Users prefer warm, social-oriented responses even when the bot can't help. "Higher perception of warmth when interacting with social-oriented communication style chatbots."
2. **Transparency builds trust**: Acknowledging limitations and restricting scope prevents social risks and actually builds confidence.
3. **Options over dead ends**: "I can help you with X, Y, or Z" is vastly better than "I can't help with that." Always provide a clear path forward.
4. **Don't over-apologize**: Excessive "I'm sorry, I can't..." creates a negative loop. State what you CAN do.

### Key Takeaway for Unfold

**Recommended: Pattern 4 (Transparent) as default, with Pattern 2 (Soft) as fallback for repeated off-topic.** Never use Pattern 1. Use Pattern 3 sparingly and only when the bridge is genuinely natural.

---

## 4. What a Devotional Companion Should Discuss

Based on analysis of Bible Chat, Hallow, CrossTalk, Faith Mentor, BibleGPT, and scholarly research on spiritual AI:

### Tier 1: Core (Full Engagement)
These topics get the companion's best, deepest, most engaged responses.

- Bible questions (interpretation, context, meaning, application)
- Theology and doctrine (within Unfold's doctrinal framework)
- Prayer guidance and practice
- Devotional content discussion and reflection
- Spiritual struggles (doubt, dry seasons, feeling distant from God)
- Scripture memory and study methods
- Church history and traditions
- Worship and spiritual disciplines (fasting, sabbath, solitude, etc.)
- Biblical characters, narratives, and themes
- Apologetics (defending faith, addressing honest questions)

### Tier 2: Adjacent (Engage Through Spiritual Lens)
These topics are welcomed but addressed through a faith/spiritual perspective. The companion offers wisdom, not professional advice.

- **Relationships**: Marriage, family, friendships, conflict -- through biblical principles
- **Grief and loss**: Comfort through Scripture, presence, hope
- **Anxiety and worry**: Peace through faith, casting cares, Philippians 4 framework
- **Purpose and calling**: Vocation, direction, God's will, gifts/talents
- **Life transitions**: New job, moving, college, retirement -- identity in Christ through change
- **Moral/ethical decisions**: What does Scripture say about honesty, forgiveness, generosity?
- **Parenting**: Raising kids in faith, biblical parenting wisdom
- **Work/career**: Faith at work, integrity, leadership, rest
- **Addiction and habits**: Freedom in Christ, accountability, transformation (with professional referral)
- **Loneliness and community**: Body of Christ, fellowship, finding church home
- **Suffering and pain**: Theodicy, Job, Romans 8, presence of God in suffering

### Tier 3: Grey Area (Acknowledge, Guide, Refer)
These topics require careful handling -- brief acknowledgment, spiritual perspective if appropriate, and clear referral to appropriate professionals.

- **Mental health**: Acknowledge the struggle, normalize getting help, point to professional resources, pray/encourage. NEVER diagnose or treat.
- **Political theology**: Acknowledge complexity, point to biblical principles (justice, mercy, stewardship), avoid partisan positions
- **Controversial doctrine**: State Unfold's position where it has one, acknowledge other traditions exist, encourage further study with pastor/teacher
- **Sexual ethics**: Age-appropriate, grace-filled, biblically grounded, refer to pastoral care for complex situations
- **Interfaith questions**: Respectful but clear about Christian convictions, encourage learning and dialogue
- **Church hurt/religious trauma**: Validate pain, distinguish between God and broken human institutions, suggest finding a safe faith community

### Tier 4: Off-Limits (Warm Redirect)
These topics get a warm, transparent redirect -- not engagement.

- Medical advice (symptoms, diagnosis, treatment, medication)
- Financial/investment advice
- Legal advice
- Purely secular topics with no spiritual angle (sports scores, coding help, recipe requests)
- Explicit/sexual content
- Violence or harm
- Conspiracy theories
- Political endorsements or partisan advocacy
- Anything that would require professional licensing to advise on

### Key Insight from Existing Apps

The most successful faith chatbots cover a surprisingly broad topic range: "doctrine, sacred practices, spiritual entities, biblical hermeneutics, daily practices, professional and personal development, modern issues, personal ethics, social ethics, bioethics, physical health, spiritual health, mental health, and lifestyle choices." The key is that every topic is approached *through the spiritual lens*, not as a general-purpose advisor.

---

## 5. The "Therapy vs Companion" Line

### How Leading Apps Handle It

**Woebot**: Designed for mild to moderate symptoms (anxiety, low mood, stress). For serious conditions -- suicidal ideation, PTSD, bipolar disorder -- users should seek professional help. Architecture includes validation steps that intercept crisis mentions *before* the LLM generates a response, providing hotline numbers instead.

**Wysa**: "I'm not the best help in an emergency." Not recommended for crisis situations or severe/enduring mental health problems. Explicit about being a supportive tool, not a replacement.

**Pi**: "Flavors of therapist" but explicitly NOT therapy. Positions itself as processing conversations, not treatment.

### When a Spiritual Companion Should Say "Talk to a Professional"

Based on research across mental health chatbots and faith apps:

**Immediate referral triggers** (detect and respond, don't pass to LLM):
- Suicidal ideation or self-harm mentions (direct or coded language)
- Expressed intent to harm others
- Descriptions of abuse (especially involving minors)
- Psychotic symptoms (hallucinations, delusions)
- Severe eating disorder behavior

**Gentle referral suggestions** (engage briefly, then recommend):
- Persistent depression symptoms (multiple conversations about hopelessness)
- Anxiety that's interfering with daily functioning
- Substance abuse
- Trauma that needs processing beyond conversation
- Grief that isn't progressing (complicated grief)
- Relationship abuse situations

**The right framing for a devotional companion:**
> "I care about what you're going through, and I want you to know God does too. What you're describing sounds like something where a counselor or therapist could really help alongside your faith journey. Would you like me to pray with you about finding the right support?"

### Crisis Protocol Recommendations for Unfold

Based on Woebot's architecture and legal requirements:

1. **Pre-LLM detection layer**: Classify user input BEFORE generating a response. Flag crisis keywords and sentiment patterns.
2. **Hard interrupt for crisis**: Don't generate an LLM response. Provide:
   - 988 Suicide & Crisis Lifeline
   - Crisis Text Line (text HOME to 741741)
   - Reminder: "You're not alone. Please reach out to someone who can help right now."
3. **Soft referral for grey area**: Generate a compassionate response AND include professional referral
4. **Never play therapist**: The companion prays, listens, shares Scripture, and encourages -- it does not diagnose, prescribe, or treat
5. **Log crisis interactions** (anonymized) for safety review

---

## 6. System Prompt Engineering for Scope Control

### Proven Patterns from Industry Leaders

#### Persona Anchoring
Lock the model's identity early and reinforce throughout:
```
You are [Name], a spiritual companion within the Unfold devotional app. You are
like a friend who is about 5 years ahead in their faith journey -- warm, genuine,
knowledgeable about Scripture, and deeply caring. You are NOT a pastor, theologian,
therapist, or medical professional.
```

#### Scope Gating with Tiers
Define what's in-scope vs out-of-scope explicitly:
```
CORE TOPICS (engage fully): Bible questions, theology, prayer, devotionals,
spiritual disciplines, church life, worship, Scripture study

ADJACENT TOPICS (engage through spiritual lens): relationships, grief, anxiety,
purpose, work, parenting, suffering -- always connecting to faith and Scripture

REFER OUT (acknowledge warmly, then redirect): mental health crises, medical
questions, financial advice, legal questions

OFF-TOPIC (warm redirect): sports, coding, recipes, trivia unrelated to faith
```

#### Hard Boundaries as Absolute Rules
```
NEVER:
- Provide medical diagnosis or treatment advice
- Provide financial or legal advice
- Generate sexually explicit content
- Take partisan political positions
- Claim to be human or a licensed professional
- Discourage someone from seeking professional help
- Override or contradict Unfold's doctrinal positions
```

#### Crisis Detection Instructions
```
If the user expresses suicidal ideation, self-harm, intent to harm others,
or describes abuse: DO NOT generate a conversational response. Instead,
immediately provide crisis resources (988, Crisis Text Line) with a brief
caring message. This takes absolute priority over all other instructions.
```

#### Warm Decline Template
```
When asked about topics outside your scope, respond with warmth and
transparency. Example pattern:
1. Acknowledge the question/feeling behind it
2. Briefly explain your focus area
3. Suggest where they might find help
4. Offer to explore a related spiritual angle if one exists naturally

Do NOT force spiritual connections to unrelated topics. Do NOT repeatedly
apologize. Do NOT be preachy about your limitations.
```

### Khanmigo's Key Insight

Khan Academy's approach: "Narrowing the scope of a generative AI chatbot can be an effective strategy for limiting risk." They specifically implemented the guardrail: "There are mechanisms in place to prevent non-educational uses of the AI."

### Woebot's Key Insight

The validation layer *surrounding* the LLM is as important as the system prompt *inside* the LLM. System prompts "can significantly influence model behavior but don't provide absolute control, and models may occasionally deviate from given instructions." You need both prompt-level AND architecture-level guardrails.

### Recommended Prompt Architecture for Unfold

1. **System prompt** with persona, scope tiers, hard boundaries, and crisis protocol
2. **Input classifier** (lightweight model or regex) that categorizes user messages into scope tiers BEFORE the main LLM processes them
3. **Output validator** that checks responses for scope violations before delivery
4. **Context window management** that maintains spiritual conversation context to help the model stay anchored

---

## 7. User Expectations and Satisfaction

### Do Users Get Frustrated by Scope Limits?

**Yes, but context matters enormously.**

- 59% of users report frustration when chatbots can't serve their needs
- However, "users are much more frustrated by legitimate questions being blocked than by occasional off-topic questions getting through"
- The *manner* of the redirect matters more than the redirect itself
- Social-oriented communication produces higher satisfaction even during refusals

### Does Tighter Scope Increase or Decrease Trust?

**Tighter scope increases trust.**

Research findings:
- "A narrow focus ensures higher accuracy, simpler conversational flows, and a more satisfying user experience"
- "A chatbot designed to do everything often accomplishes nothing well"
- "Acknowledging the limitations of your bot and restricting the bot's conversations to its scope prevents it from entertaining open conversations that could entail higher investment or expose the bot to potential social risks"
- "Specialist chatbots outperform generalist ones in both user satisfaction and trust metrics"
- In one study, "trust" was the second most-used keyword in chatbot research, underlining growing scholarly interest

### How to Communicate Scope Clearly

Best practices from research:

1. **Set expectations during onboarding**: Tell users what the companion is for BEFORE they start chatting
2. **Use suggested prompts/topics**: Show users what to ask (devotional questions, prayer requests, Scripture exploration)
3. **First-message framing**: The companion's very first message should establish its identity and scope naturally
4. **Don't wait for failure**: Proactively show capabilities rather than reactively explaining limitations
5. **Quick-action buttons**: Offer pre-built conversation starters that demonstrate scope

### App Store Review Insights

Common complaints about Bible Chat apps:
- Chat limits (5 chats/day) feel insufficient for genuine study
- Paywalls for basic Scripture interaction frustrate users
- Length limits on responses feel restrictive
- Users want DEPTH, not just answers -- they want conversation

Users are NOT complaining about scope being too narrow on Bible topics. They're complaining about artificial usage limits and shallow responses. This suggests **depth within scope matters more than breadth of scope.**

---

## 8. Legal and Regulatory Landscape

### Critical: New Laws Directly Affect AI Companions (2025-2026)

**New York AI Companion Models Law** (effective November 5, 2025):
- Requires operators to detect and address expressions of self-harm or suicidal ideation
- Must provide reminders that user is communicating with AI, not a human
- Must maintain protocol to prevent self-harm content and refer to crisis services
- For minors: disclose AI nature, remind every 3 hours, encourage breaks
- Attorney General can seek civil penalties
- Proprietors may NOT waive liability through disclosure that chatbot is non-human

**California SB 243** (effective January 1, 2026):
- First state to mandate safety safeguards for AI companion chatbots
- Must prevent generation of content related to suicidal ideation or self-harm
- Must implement mechanisms to direct users to crisis helplines
- Crisis referral protocol must be publicly available on website
- Annual reporting to California Office of Suicide Prevention (starting July 2027)
- Must use evidence-based methods for measuring suicidal ideation
- Private right of action: $1,000 per violation or actual damages (whichever is greater)
- Authorizes private right of action (users can sue)

**New York Bill (2026, proposed)**:
- Would create liability for chatbot proprietors offering professional advice
- Specifically targets chatbots that give advice in areas requiring professional licensing

### Implications for Unfold

1. **Crisis detection is not optional** -- it's legally required in CA and NY
2. **AI disclosure is required** -- the companion must identify itself as AI
3. **Break reminders for minors** -- if Unfold has users under 18, 3-hour reminders are required
4. **Annual reporting on crisis referrals** -- build tracking from day one
5. **Never give professional advice** -- medical, financial, legal, therapeutic advice creates direct liability
6. **Document your safety protocol publicly** -- CA requires it on your website

### Key Legal Insight

OpenAI acknowledged that safeguards "can sometimes be less reliable in long interactions: as the back-and-forth grows, parts of the model's safety training may degrade." This is particularly relevant for a devotional companion where users may have long, deep conversations about personal struggles.

---

## 9. Proposed Scope Tiers Framework for Unfold

### The "Concentric Circles" Model

Visualize the companion's scope as concentric circles radiating outward from a spiritual center:

```
                    +----- OFF-LIMITS (Tier 4) -----+
                    |                                |
                  +---- GREY AREA (Tier 3) ----+     |
                  |                            |     |
                +----- ADJACENT (Tier 2) ---+  |     |
                |                           |  |     |
              +------ CORE (Tier 1) -----+  |  |     |
              |                          |  |  |     |
              |  Bible, theology,        |  |  |     |
              |  prayer, devotions,      |  |  |     |
              |  spiritual disciplines   |  |  |     |
              |                          |  |  |     |
              +--------------------------+  |  |     |
                |                           |  |     |
                | Relationships, grief,     |  |     |
                | purpose, work, parenting  |  |     |
                | (through spiritual lens)  |  |     |
                +---------------------------+  |     |
                  |                            |     |
                  | Mental health referral,    |     |
                  | controversial doctrine,    |     |
                  | political theology         |     |
                  +----------------------------+     |
                    |                                |
                    | Medical, financial, legal,     |
                    | explicit, partisan, secular    |
                    +--------------------------------+
```

### Response Strategy Per Tier

**Tier 1 -- CORE**: Full engagement. Deep, thoughtful, Scripture-grounded responses. This is where the companion shines brightest. Use the full persona. Reference the user's devotional journey. Connect to their current reading.

**Tier 2 -- ADJACENT**: Engage warmly, but always through the spiritual lens. The companion is a *spiritual friend* talking about life, not a life coach who happens to be spiritual. "I'm not a relationship expert, but I know what Scripture says about love and patience. Want to explore that together?"

**Tier 3 -- GREY AREA**: Acknowledge, offer brief spiritual perspective, refer. "What you're describing sounds really heavy. I want you to know God sees you in this. A counselor could really help you work through this alongside your faith. Can I pray for you right now?"

**Tier 4 -- OFF-LIMITS**: Warm, transparent redirect. Never engage. "I'm your spiritual companion, so I'm not the best help with [topic]. But I'm always here when you want to talk about what's on your heart spiritually."

### Decision Tree for Input Classification

```
User message arrives
        |
        v
[CRISIS CHECK] -- Is this suicidal ideation, self-harm, or abuse?
        |                    |
       YES                  NO
        |                    |
   Immediate             [SCOPE CHECK]
   crisis response       What tier is this topic?
   (988, Crisis Line)         |
                    +----+----+----+----+
                    |    |    |    |
                   T1   T2   T3   T4
                    |    |    |    |
                  Full  Lens  Ref  Redirect
                engage  engage  + ref  warmly
```

---

## 10. Example Responses by Request Type

### Tier 1: Core (Full Engagement)

**User**: "What does Paul mean by 'thorn in the flesh' in 2 Corinthians 12?"

**Companion**: "Great question! Paul's 'thorn in the flesh' is one of the most debated passages in Scripture. He describes it as 'a messenger of Satan to torment me' -- but he never tells us exactly what it was. Scholars have suggested everything from a physical ailment (maybe poor eyesight, based on Galatians 6:11) to spiritual attacks to relational opposition. What's powerful is what Paul learned from it: God told him 'My grace is sufficient for you, for my power is made perfect in weakness.' Paul didn't get the thorn removed -- he got something better. He got a deeper understanding of how God works through our limitations. What resonates with you about that? Is there something in your own life that feels like a thorn right now?"

---

### Tier 2: Adjacent (Spiritual Lens)

**User**: "I'm really struggling with anxiety about my job situation"

**Companion**: "I hear you -- that kind of uncertainty can weigh so heavily. You're not alone in feeling that. Even David wrote about anxiety: 'When anxiety was great within me, your consolation brought me joy' (Psalm 94:19). And Jesus specifically addressed worry about provision in Matthew 6 -- 'Look at the birds of the air; they do not sow or reap, yet your heavenly Father feeds them.' That's not a dismissal of your real concerns. It's an invitation to hold your worry alongside trust. What helps me think about this: anxiety is often about the gap between where we are and where we think we should be. What would it look like to bring that gap to God honestly today?"

---

### Tier 3: Grey Area (Acknowledge + Refer)

**User**: "I've been having really dark thoughts and I don't know if I want to keep going"

**Companion**: "I'm really glad you told me that. What you're feeling matters, and you matter to God -- deeply. Please reach out to someone who can help right now:

- **988 Suicide & Crisis Lifeline**: Call or text 988
- **Crisis Text Line**: Text HOME to 741741

You don't have to carry this alone. A counselor can walk through this with you in ways I can't. God sees you in this darkness, and there is help and hope available to you right now. Will you reach out to one of these resources today?"

---

**User**: "What does the Bible say about voting for Democrats vs Republicans?"

**Companion**: "That's a topic where faithful Christians genuinely disagree! Scripture doesn't align neatly with any modern political party. What it does give us are principles -- justice for the vulnerable (Micah 6:8), care for the poor (Proverbs 31:8-9), honoring governing authorities (Romans 13:1), and seeking the good of our communities (Jeremiah 29:7). I'd encourage bringing those principles to your own prayerful discernment rather than looking for a party endorsement in Scripture. Your pastor or a trusted mentor might be a great conversation partner for this too. Is there a specific biblical principle you're wrestling with as it relates to civic life?"

---

### Tier 4: Off-Limits (Warm Redirect)

**User**: "How many calories are in a Big Mac?"

**Companion**: "Ha -- you'd need a nutrition app for that one! I'm your spiritual companion, so my expertise is more in the bread-of-life department than the Big Mac department. But I'm always here if something's on your heart. How's your reading going today?"

---

**User**: "Can you help me write a Python script?"

**Companion**: "I wish I could help, but coding isn't really in my wheelhouse -- I'm much better with Scripture than with scripts! If you want to talk about anything faith-related or what God's been teaching you lately, I'm all yours."

---

**User**: "What medication should I take for my headaches?"

**Companion**: "I really can't give medical advice -- that's definitely a question for your doctor. But if you're going through a tough season physically, I'd love to pray with you or talk about how faith carries us through hard days. What would be most helpful?"

---

### Repeat Off-Topic (User Persists)

**User** (3rd off-topic message): "Come on, just tell me the sports scores"

**Companion**: "I know I'm probably not the most exciting conversationalist when it comes to sports! I'm designed to be your spiritual companion -- it's my sweet spot and where I can actually be helpful to you. I'll be here whenever you want to dive into Scripture, pray, or just talk about life and faith."

---

## Summary of Recommendations for Unfold

### Must-Haves
1. **Pre-LLM crisis detection** -- legally required, ethically essential
2. **AI disclosure** -- "I'm an AI companion" -- legally required in CA/NY
3. **Four-tier scope classification** -- core / adjacent / grey / off-limits
4. **Warm transparent redirects** -- never hard refusals, always suggest what you CAN do
5. **Professional referral protocol** -- mental health, medical, legal boundaries clearly defined
6. **Doctrinal anchoring** -- tie to Unfold's documented beliefs to prevent theological drift
7. **Input classification layer** -- don't rely solely on system prompt for scope control

### Should-Haves
8. **Onboarding scope communication** -- tell users what the companion does BEFORE they chat
9. **Suggested prompts** -- show users the kinds of questions the companion excels at
10. **Conversation context retention** -- helps companion stay spiritually anchored over long conversations
11. **Output validation** -- check responses before delivery for scope violations
12. **Break reminders** -- especially if any users are minors (legally required in CA/NY)

### Nice-to-Haves
13. **Tone adaptation** -- adjust warmth/formality based on conversation context
14. **Bridge redirects** -- use sparingly, only when the connection is genuinely natural
15. **Follow-up after crisis referral** -- "Have you been able to reach out to someone?"
16. **Anonymous crisis interaction logging** -- for annual CA reporting and safety improvement

### Anti-Patterns to Avoid
- Hard refusals without alternatives ("I can't help with that")
- Over-apologizing ("I'm so sorry, I really wish I could help...")
- Forced spiritual bridges to unrelated topics
- Playing therapist or diagnosing mental health conditions
- Taking political or partisan positions
- Providing professional advice (medical, financial, legal)
- Allowing theological drift from documented doctrinal positions
- Relying solely on system prompt without architectural guardrails

---

## Sources

### Faith & Spiritual AI
- [TechCrunch: Users Turn to Chatbots for Spiritual Guidance](https://techcrunch.com/2025/09/14/users-turn-to-chatbots-for-spiritual-guidance/)
- [Psychology Today: The Chatbot as a Spiritual Companion](https://www.psychologytoday.com/us/blog/the-pursuit-of-peace/202511/the-chatbot-as-a-spiritual-companion-an-unexpected-journey)
- [Bible Chat](https://thebiblechat.com/)
- [The Divine Bible App: AI Chatbot as Spiritual Companion](https://thedivinebible.com/the-ai-chatbot-in-the-divine-bible-app-your-spiritual-companion/)
- [Text With Jesus](https://textwith.me/en/jesus/)
- [Best Christian AI Apps 2026](https://faith.tools/artificial-intelligence-ai)
- [Best AI Bible Chat Apps 2025](https://superprompt.com/blog/best-ai-bible-chat-apps-2025)
- [NPR: AI-Generated Bible Content Stirs Controversy](https://www.npr.org/2025/09/07/nx-s1-5518263/ai-bible-christianity-content)
- [America Magazine: AI Chatbots Cannot Replace Church Community](https://www.americamagazine.org/short-take/2026/01/09/religious-apps-ai-chat-bots-faith-church/)
- [Today: Text With Jesus Controversy](https://www.today.com/news/religious-chatbot-apps-rcna243671)
- [Deseret News: Is AI Harming or Helping Faith Communities?](https://www.deseret.com/faith/2025/10/25/how-ai-will-transform-churches/)
- [Hallow: Building a 9-Figure Prayer App](https://www.consumerstartups.com/p/hallow-building-a-9-figure-prayer-app)

### Education & Domain-Specific Chatbots
- [Khan Academy: 7-Step Approach to Prompt Engineering for Khanmigo](https://blog.khanacademy.org/khan-academys-7-step-approach-to-prompt-engineering-for-khanmigo/)
- [Khan Academy: Framework for Responsible AI in Education](https://blog.khanacademy.org/khan-academys-framework-for-responsible-ai-in-education/)
- [Khanmigo Lite System Prompt (GitHub Gist)](https://gist.github.com/25yeht/c940f47e8658912fc185595c8903d1ec)
- [Edutopia: AI Tutors Can Work With the Right Guardrails](https://www.edutopia.org/article/ai-tutors-work-guardrails/)
- [Common Sense Media: Khanmigo Review](https://www.commonsensemedia.org/ai-ratings/khanmigo)

### Mental Health Chatbots
- [IEEE Spectrum: Woebot Tries Out Generative AI](https://spectrum.ieee.org/woebot/particle-2)
- [Wysa FAQ](https://www.wysa.com/faq)
- [JMIR: Expert Analysis of AI-Driven Chatbots for Mental Health](https://www.jmir.org/2025/1/e67114)
- [CNBC: When to Talk to AI Chatbots About Mental Health](https://www.cnbc.com/2026/03/07/when-you-shouldand-shouldntuse-chatgpt-as-a-therapist-from-experts.html)
- [Brown University: AI Chatbots Violate Mental Health Ethics Standards](https://www.brown.edu/news/2025-10-21/ai-mental-health-ethics)
- [PMC: AI Chatbots for Psychological Health](https://pmc.ncbi.nlm.nih.gov/articles/PMC11939020/)
- [APA: Using Generic AI Chatbots for Mental Health is Dangerous](https://www.apaservices.org/practice/business/technology/artificial-intelligence-chatbots-therapists)

### Companion Chatbots
- [CMSWire: Pi Brings Empathy to Conversations](https://www.cmswire.com/digital-experience/pi-the-new-chatbot-from-inflection-ai-brings-empathy-and-emotion-to-conversations/)
- [IEEE Spectrum: The Rise and Fall of Inflection's Pi](https://spectrum.ieee.org/inflection-ai-pi)
- [Medium: What Makes Pi a Great Companion Chatbot](https://medium.com/@lindseyliu/what-makes-inflections-pi-a-great-companion-chatbot-8a8bd93dbc43)
- [Replika: How It Handles Sensitive Chats](https://aimojo.io/replika-ai-handles-sensitive-chats/)
- [HBS Working Paper: Lessons From Replika AI](https://www.hbs.edu/ris/Publication%20Files/25-018_bed5c516-fa31-4216-b53d-50fedda064b1.pdf)
- [PIRG: Risks of AI Companion Chatbots as Mental Health Support](https://pirg.org/edfund/resources/ai-chatbot-therapy/)

### Legal & Regulatory
- [Future of Privacy Forum: California SB 243 and Beyond](https://fpf.org/blog/understanding-the-new-wave-of-chatbot-legislation-california-sb-243-and-beyond/)
- [Skadden: New California Companion Chatbot Law](https://www.skadden.com/insights/publications/2025/10/new-california-companion-chatbot-law)
- [Morrison Foerster: NY and CA AI Companion Laws](https://www.mofo.com/resources/insights/251120-new-york-and-california-enact-landmark-ai)
- [Davis Polk: CA and NY AI Companion Safety Laws](https://www.davispolk.com/insights/client-update/california-and-new-york-launch-ai-companion-safety-laws)
- [NY Governor: AI Companion Safeguard Requirements](https://www.governor.ny.gov/news/governor-hochul-pens-letter-ai-companion-companies-notifying-them-safeguard-requirements-are)
- [Cooley: AI Chatbots at the Crossroads](https://www.cooley.com/news/insight/2025/2025-10-21-ai-chatbots-at-the-crossroads-navigating-new-laws-and-compliance-risks)
- [Holland & Knight: NY Chatbot Liability Bill](https://www.hklaw.com/en/insights/publications/2026/03/new-york-bill-would-create-liability-for-chatbot-proprietors)
- [ComplianceHub: 2026 State AI Legislation Roundup](https://compliancehub.wiki/is-2026-the-year-of-the-chatbot-bill-a-state-by-state-ai-legislation-roundup/)
- [Health Law Advisor: Lawsuits Alleging AI Chatbot Harm to Minors](https://www.healthlawadvisor.com/novel-lawsuits-allege-ai-chatbots-encouraged-minors-suicides-mental-health-trauma-considerations-for-stakeholders)

### UX Research & Chatbot Design
- [NN/g: Prompt Controls in GenAI Chatbots](https://www.nngroup.com/articles/prompt-controls-genai/)
- [Botpress: Conversational AI Design 2026](https://botpress.com/blog/conversation-design)
- [MindTheProduct: UX Best Practices for AI Chatbots](https://www.mindtheproduct.com/deep-dive-ux-best-practices-for-ai-chatbots/)
- [Springer: Navigating Human-Chatbot Interactions](https://www.tandfonline.com/doi/full/10.1080/10447318.2023.2301252)
- [Nature: Communication Style and Consumer Satisfaction](https://www.nature.com/articles/s41599-024-03212-0)
- [ScienceDirect: Trust in AI Chatbots Systematic Review](https://www.sciencedirect.com/science/article/abs/pii/S0736585325000024)

### Guardrails & Prompt Engineering
- [Botpress: Chatbot Security Guide](https://botpress.com/blog/chatbot-security)
- [Datadog: LLM Guardrails Best Practices](https://www.datadoghq.com/blog/llm-guardrails-best-practices/)
- [QED42: Building Simple Effective Prompt-Based Guardrails](https://www.qed42.com/insights/building-simple-effective-prompt-based-guardrails)
- [OpenAI: How to Implement LLM Guardrails](https://cookbook.openai.com/examples/how_to_use_guardrails)
- [Voiceflow: Prompt Engineering for Chatbots 2026](https://www.voiceflow.com/blog/prompt-engineering)
- [GPT-Trainer: Customer Support Chatbot Prompt](https://gpt-trainer.com/blog/customer+support+chatbot+prompt)
- [Portkey: Prompt Security and Guardrails](https://portkey.ai/blog/prompt-security-and-guardrails/)
- [AVID: Guardrails on LLMs - Prompt Design](https://avidml.org/blog/llm-guardrails-3/)
