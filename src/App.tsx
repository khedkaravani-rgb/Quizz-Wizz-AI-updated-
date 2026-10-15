import { useEffect, useRef, useState } from "react";
import Header from "./components/Header";
import Footer from "./components/Footer";
import { generateQuiz, submitAttempt, type AdaptiveQuestion, type Difficulty, type GeneratedQuiz } from "./lib/quizApi";
import { supabase, supabaseSetupError } from "./lib/supabaseClient";
import "./App.css";

type View = "home" | "how" | "demo" | "login" | "courses" | "quiz" | "results";
type SelectedAnswer = { question_id: string; selected_answer: string };
type FollowUp = AdaptiveQuestion["follow_ups"][number];
type AnswerSignal = { secondsToAnswer: number; answerChanges: number };

export default function App() {
  const [view, setView] = useState<View>("home");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [student, setStudent] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [topic, setTopic] = useState("Object-Oriented Programming");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [count, setCount] = useState(5);
  const [quiz, setQuiz] = useState<GeneratedQuiz | null>(null);
  const [index, setIndex] = useState(0);
  const [choice, setChoice] = useState("");
  const [feedback, setFeedback] = useState("");
  const [followUp, setFollowUp] = useState<FollowUp | null>(null);
  const [isFollowUp, setIsFollowUp] = useState(false);
  const [answers, setAnswers] = useState<SelectedAnswer[]>([]);
  const [mistakes, setMistakes] = useState<string[]>([]);
  const [result, setResult] = useState<{ score: number; total: number } | null>(null);
  const [answerSignals, setAnswerSignals] = useState<Record<string, AnswerSignal>>({});
  const questionStartedAt = useRef(Date.now());
  const answerSignalsRef = useRef<Record<string, AnswerSignal>>({});

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => {
      const currentEmail = data.session?.user.email ?? "";
      if (currentEmail) { setStudent(currentEmail); setView("courses"); }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentEmail = session?.user.email ?? "";
      setStudent(currentEmail);
      if (currentEmail) setView("courses");
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const start = () => setView(student ? "courses" : "login");
  useEffect(() => { if (view === "quiz" && quiz && !isFollowUp) questionStartedAt.current = Date.now(); }, [view, quiz, index, isFollowUp]);

  const handleAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase) { setMessage(supabaseSetupError); return; }
    setBusy(true); setMessage("");
    try {
      if (authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        if (!data.session) setMessage("Check your email for a confirmation link, then return here to sign in.");
        else { setStudent(email.trim()); setView("courses"); }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        setStudent(email.trim()); setView("courses");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not sign in.");
    } finally { setBusy(false); }
  };

  const signOut = async () => {
    await supabase?.auth.signOut();
    setStudent(""); setQuiz(null); setView("home");
  };

  const begin = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      const generated = await generateQuiz({ topic: topic.trim(), difficulty, numQuestions: count });
      setQuiz(generated); setIndex(0); setChoice(""); setFeedback(""); setFollowUp(null);
      setIsFollowUp(false); setAnswers([]); setMistakes([]); setResult(null); answerSignalsRef.current = {}; setAnswerSignals({}); setView("quiz");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Quiz generation failed.");
    } finally { setBusy(false); }
  };

  const moveNext = async (nextAnswers: SelectedAnswer[]) => {
    if (!quiz) return;
    const next = index + 1;
    if (next < quiz.questions.length) {
      setIndex(next); setChoice(""); setFeedback(""); setFollowUp(null); setIsFollowUp(false); return;
    }
    setBusy(true);
    try {
      const saved = await submitAttempt({ quiz_id: quiz.quiz.id, answers: nextAnswers });
      setResult({ score: saved.score, total: saved.total });
      setView("results");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save your attempt.");
    } finally { setBusy(false); }
  };

  const check = async () => {
    if (!quiz || !choice || busy) return;
    const question = quiz.questions[index];
    if (isFollowUp) {
      setFeedback(followUp?.explanation ?? "Good effort. Keep the idea in mind as you continue.");
      await moveNext(answers);
      return;
    }
    if (answers.some((answer) => answer.question_id === question.id)) { await moveNext(answers); return; }
    const record = { question_id: question.id, selected_answer: choice };
    const nextAnswers = [...answers, record];
    setAnswers(nextAnswers);
    if (choice === question.correct_answer) {
      setFeedback(question.explanation);
      await moveNext(nextAnswers);
      return;
    }
    setMistakes((current) => current.includes(question.topic_tag) ? current : [...current, question.topic_tag]);
    const diagnosis = question.misconceptions?.find((item) => item.option === choice)?.explanation ?? "Let's review this concept and try a focused question.";
    const retry = question.follow_ups?.find((item) => item.mistaken_option === choice);
    setFeedback(diagnosis);
    if (retry) { setFollowUp(retry); setIsFollowUp(true); setChoice(""); }
    else await moveNext(nextAnswers);
  };

  const current = quiz?.questions[index];
  const currentPrompt = isFollowUp ? followUp?.question : current?.question_text;
  const currentOptions = isFollowUp ? followUp?.options : current?.options;
  const showHow = () => { setView("how"); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const showDemo = () => { setView("demo"); window.scrollTo({ top: 0, behavior: "smooth" }); };
  return <div className="app"><Header onStart={start} onHow={showHow} onDemo={showDemo} onLogin={() => setView("login")} onLogout={signOut} student={student}/>
    {view === "home" && <main><section className="hero"><div><p className="eyebrow">* A brighter way to revise</p><h1>Study less.<br/><em>Remember</em> more.</h1><p className="lead">Quizz-Wizz turns your study topics into adaptive quizzes that help explain why an answer was wrong.</p><button className="primary" onClick={start}>Start a quick quiz -&gt;</button></div><aside className="preview"><small>Adaptive quiz - OOP</small><h2>Learn from every answer.</h2><p>Missed questions receive feedback and a follow-up aimed at the misconception.</p></aside></section><section className="how" id="how"><h2>Your study sidekick.</h2><div><article><b>01 - Choose</b><p>Pick a topic and difficulty.</p></article><article><b>02 - Learn</b><p>Receive feedback tied to your answer.</p></article><article><b>03 - Grow</b><p>Save your score and track weak topics.</p></article></div></section></main>}
    {view === "how" && <main className="how-page"><section className="how-hero"><p className="eyebrow">A little more than a quiz</p><h1>Practice that <em>learns</em> with you.</h1><p className="lead">Quizz-Wizz turns a topic you want to study into focused practice, with feedback that helps you understand the ideas behind each answer.</p><button className="primary" onClick={start}>Build your first quiz <span aria-hidden="true">→</span></button><span className="how-note">Your progress is saved when you’re signed in.</span></section><section className="how-steps"><div className="how-section-heading"><p className="eyebrow">The learning loop</p><h2>Three steps. One clearer path forward.</h2></div><div className="step-grid"><article className="step-card"><span className="step-number">01</span><div><h3>Set your focus</h3><p>Choose what you’re studying, set a difficulty, and pick how many questions you want. Quizz-Wizz creates a quiz around your topic.</p></div><span className="step-icon" aria-hidden="true">✳</span></article><article className="step-card"><span className="step-number">02</span><div><h3>Answer and understand</h3><p>Choose an answer to see feedback. If you miss a question, Quizz-Wizz explains the misconception and may give you a short follow-up to practise that idea.</p></div><span className="step-icon" aria-hidden="true">↗</span></article><article className="step-card"><span className="step-number">03</span><div><h3>See what’s sticking</h3><p>Finish the quiz to see your score and a recap of the topics you answered correctly or practised again. Your attempt is saved to your account.</p></div><span className="step-icon" aria-hidden="true">◎</span></article></div></section><section className="how-callout"><div><p className="eyebrow">Ready when you are</p><h2>Make your next study session count.</h2><p>Sign in, choose a topic, and let’s get started.</p></div><button className="primary" onClick={start}>Start learning <span aria-hidden="true">→</span></button></section></main>}
    {view === "demo" && <main className="demo-page"><section className="demo-heading"><p className="eyebrow">Expected outcome · shared question</p><h1>One question.<br/><em>Three different</em> ways to think.</h1><p className="lead">Each learner chooses a different wrong answer. Quizz-Wizz identifies the likely misconception, explains the diagnosis, and gives them a focused follow-up.</p></section><section className="shared-question"><span className="level">Biology · Photosynthesis</span><h2>What is the main role of sunlight in photosynthesis?</h2><p>Correct answer: <b>B · It provides energy to drive the process.</b></p></section><div className="learner-grid"><article className="learner-card"><div className="learner-top"><span className="learner-avatar">A</span><div><span className="eyebrow">Learner 01</span><h2>Thinks light is matter</h2></div></div><p className="answer-chip">Selected A · Sunlight is converted into plant mass</p><div className="reasoning"><b>Likely misconception</b><p>Confuses the source of energy with the materials used to build sugars and plant tissue.</p></div><div className="followup"><span className="eyebrow">Tailored follow-up</span><h3>Which materials supply most of the matter used to build a plant’s sugars?</h3><p><b>Answer:</b> Carbon dioxide and water.</p><p><b>Why this helps:</b> It separates matter inputs from the energy sunlight provides.</p></div></article><article className="learner-card"><div className="learner-top"><span className="learner-avatar">B</span><div><span className="eyebrow">Learner 02</span><h2>Thinks light is food</h2></div></div><p className="answer-chip">Selected C · It is absorbed as food by the plant</p><div className="reasoning"><b>Likely misconception</b><p>Treats sunlight itself as food instead of an energy source used to make sugars.</p></div><div className="followup"><span className="eyebrow">Tailored follow-up</span><h3>What energy-rich substance does a plant make using light?</h3><p><b>Answer:</b> Glucose, a sugar.</p><p><b>Why this helps:</b> It checks whether the learner can distinguish light from the food produced.</p></div></article><article className="learner-card"><div className="learner-top"><span className="learner-avatar">C</span><div><span className="eyebrow">Learner 03</span><h2>Thinks light is a catalyst</h2></div></div><p className="answer-chip">Selected D · It is only a catalyst and is not used</p><div className="reasoning"><b>Likely misconception</b><p>Recognizes that light is not a material ingredient but misses that its energy is transformed and stored.</p></div><div className="followup"><span className="eyebrow">Tailored follow-up</span><h3>Where does the energy from sunlight end up after photosynthesis?</h3><p><b>Answer:</b> Stored as chemical energy in sugars.</p><p><b>Why this helps:</b> It checks understanding of energy transfer rather than matter or food.</p></div></article></div><aside className="demo-note"><b>What this demonstrates</b><p>The question stays the same, while the selected answer changes the inferred misconception and follow-up. This is a fixed illustrative demo; the live quiz flow still uses AI-generated questions and answer mappings.</p></aside></main>}    {view === "login" && <main className="screen"><section className="card"><p className="eyebrow">Your learning space</p><h1>{authMode === "signin" ? "Welcome back." : "Create your account."}</h1><p>Sign in to generate quizzes and save your learning progress.</p><form onSubmit={handleAuth}><label>Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email"/></label><label>Password<input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={authMode === "signup" ? "new-password" : "current-password"}/></label><button className="primary" disabled={busy}>{busy ? "Please wait…" : authMode === "signin" ? "Sign in" : "Create account"}</button></form><button className="link-button auth-toggle" onClick={() => { setAuthMode(authMode === "signin" ? "signup" : "signin"); setMessage(""); }}>{authMode === "signin" ? "Need an account? Sign up" : "Already registered? Sign in"}</button>{message && <aside className="feedback"><p>{message}</p></aside>}</section></main>}
    {view === "courses" && <main className="screen"><section className="card"><p className="eyebrow">Hello, {student}</p><h1>Build a quiz.</h1><form onSubmit={begin}><label>Topic<input required maxLength={120} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Photosynthesis"/></label><label>Difficulty<select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label><label>Questions<select value={count} onChange={(e) => setCount(Number(e.target.value))}>{[3,5,8,10].map((number) => <option key={number} value={number}>{number}</option>)}</select></label><button className="primary" disabled={busy}>{busy ? "Creating your quiz…" : "Generate quiz with AI"}</button></form>{message && <aside className="feedback"><p>{message}</p></aside>}</section></main>}
    {view === "quiz" && current && <main className="screen"><section className="card quiz"><div className="top"><span>{quiz?.quiz.topic}</span><span>Question {index + 1} / {quiz?.questions.length}{isFollowUp ? " · Follow-up" : ""}</span></div><span className="level">Difficulty: {isFollowUp ? "Easy" : quiz?.quiz.difficulty}</span><p className="eyebrow">{current.topic_tag}</p><h1>{currentPrompt}</h1><div className="options">{currentOptions?.map((option, optionIndex) => { const letter = String.fromCharCode(65 + optionIndex); return <button key={`${letter}-${option}`} className={choice === letter ? "selected" : ""} onClick={() => { if (!isFollowUp && choice && choice !== letter && current) { const prior = answerSignalsRef.current[current.id] ?? { secondsToAnswer: 0, answerChanges: 0 }; answerSignalsRef.current = { ...answerSignalsRef.current, [current.id]: { ...prior, answerChanges: prior.answerChanges + 1 } }; setAnswerSignals(answerSignalsRef.current); } setChoice(letter); }}><i/> <b>{letter}.</b> {option}</button>; })}</div>{feedback && <aside className="feedback"><b>{isFollowUp ? "Focused practice" : "Let's fix this together."}</b><p>{feedback}</p></aside>}<button className="primary" disabled={!choice || busy} onClick={() => void check()}>{busy ? "Saving…" : "Check answer"}</button></section></main>}
    {view === "results" && <main className="screen"><section className="card"><p className="eyebrow">Quiz complete</p><h1>Nice work, {student.split("@")[0]}.</h1><div className="score">{result?.score ?? 0} / {result?.total ?? 0}</div><p>Your attempt is saved. Questions you missed received targeted follow-up practice.</p><div className="report">{quiz?.questions.map((item) => { const signal = answerSignals[item.id]; return <div key={item.id}><span>{item.topic_tag}<small className="signal-detail">{signal ? `Answered in ${signal.secondsToAnswer}s · ${signal.answerChanges} answer changes` : "No timing signal recorded"}</small></span><b>{mistakes.includes(item.topic_tag) ? "Practiced after a mistake" : "Correct first try"}</b></div>; })}</div><p className="signal-note">Time and answer changes are behavior signals only. They can reflect many things and are not treated as proof of hesitation or misunderstanding.</p>{message && <aside className="feedback"><p>{message}</p></aside>}<button className="primary" onClick={() => setView("courses")}>Make another quiz</button></section></main>}
    <Footer/></div>;
}

