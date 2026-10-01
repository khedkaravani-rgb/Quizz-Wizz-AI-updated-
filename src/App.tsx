import { useEffect, useState } from "react";
import Header from "./components/Header";
import Footer from "./components/Footer";
import { generateQuiz, submitAttempt, type AdaptiveQuestion, type Difficulty, type GeneratedQuiz } from "./lib/quizApi";
import { supabase, supabaseSetupError } from "./lib/supabaseClient";
import "./App.css";

type View = "home" | "login" | "courses" | "quiz" | "results";
type SelectedAnswer = { question_id: string; selected_answer: string };
type FollowUp = AdaptiveQuestion["follow_ups"][number];

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
      setIsFollowUp(false); setAnswers([]); setMistakes([]); setResult(null); setView("quiz");
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
  return <div className="app"><Header onStart={start} onLogin={() => setView("login")} onLogout={signOut} student={student}/>
    {view === "home" && <main><section className="hero"><div><p className="eyebrow">* A brighter way to revise</p><h1>Study less.<br/><em>Remember</em> more.</h1><p className="lead">Quizz-Wizz turns your study topics into adaptive quizzes that help explain why an answer was wrong.</p><button className="primary" onClick={start}>Start a quick quiz -&gt;</button></div><aside className="preview"><small>Adaptive quiz - OOP</small><h2>Learn from every answer.</h2><p>Missed questions receive feedback and a follow-up aimed at the misconception.</p></aside></section><section className="how" id="how"><h2>Your study sidekick.</h2><div><article><b>01 - Choose</b><p>Pick a topic and difficulty.</p></article><article><b>02 - Learn</b><p>Receive feedback tied to your answer.</p></article><article><b>03 - Grow</b><p>Save your score and track weak topics.</p></article></div></section></main>}
    {view === "login" && <main className="screen"><section className="card"><p className="eyebrow">Your learning space</p><h1>{authMode === "signin" ? "Welcome back." : "Create your account."}</h1><p>Sign in to generate quizzes and save your learning progress.</p><form onSubmit={handleAuth}><label>Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email"/></label><label>Password<input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={authMode === "signup" ? "new-password" : "current-password"}/></label><button className="primary" disabled={busy}>{busy ? "Please wait…" : authMode === "signin" ? "Sign in" : "Create account"}</button></form><button className="link-button auth-toggle" onClick={() => { setAuthMode(authMode === "signin" ? "signup" : "signin"); setMessage(""); }}>{authMode === "signin" ? "Need an account? Sign up" : "Already registered? Sign in"}</button>{message && <aside className="feedback"><p>{message}</p></aside>}</section></main>}
    {view === "courses" && <main className="screen"><section className="card"><p className="eyebrow">Hello, {student}</p><h1>Build a quiz.</h1><form onSubmit={begin}><label>Topic<input required maxLength={120} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Photosynthesis"/></label><label>Difficulty<select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label><label>Questions<select value={count} onChange={(e) => setCount(Number(e.target.value))}>{[3,5,8,10].map((number) => <option key={number} value={number}>{number}</option>)}</select></label><button className="primary" disabled={busy}>{busy ? "Creating your quiz…" : "Generate quiz with AI"}</button></form>{message && <aside className="feedback"><p>{message}</p></aside>}</section></main>}
    {view === "quiz" && current && <main className="screen"><section className="card quiz"><div className="top"><span>{quiz?.quiz.topic}</span><span>Question {index + 1} / {quiz?.questions.length}{isFollowUp ? " · Follow-up" : ""}</span></div><span className="level">Difficulty: {isFollowUp ? "Easy" : quiz?.quiz.difficulty}</span><p className="eyebrow">{current.topic_tag}</p><h1>{currentPrompt}</h1><div className="options">{currentOptions?.map((option, optionIndex) => { const letter = String.fromCharCode(65 + optionIndex); return <button key={`${letter}-${option}`} className={choice === letter ? "selected" : ""} onClick={() => setChoice(letter)}><i/> <b>{letter}.</b> {option}</button>; })}</div>{feedback && <aside className="feedback"><b>{isFollowUp ? "Focused practice" : "Let's fix this together."}</b><p>{feedback}</p></aside>}<button className="primary" disabled={!choice || busy} onClick={() => void check()}>{busy ? "Saving…" : "Check answer"}</button></section></main>}
    {view === "results" && <main className="screen"><section className="card"><p className="eyebrow">Quiz complete</p><h1>Nice work, {student.split("@")[0]}.</h1><div className="score">{result?.score ?? 0} / {result?.total ?? 0}</div><p>Your attempt is saved. Questions you missed received targeted follow-up practice.</p><div className="report">{quiz?.questions.map((item) => <div key={item.id}><span>{item.topic_tag}</span><b>{mistakes.includes(item.topic_tag) ? "Practiced after a mistake" : "Correct first try"}</b></div>)}</div>{message && <aside className="feedback"><p>{message}</p></aside>}<button className="primary" onClick={() => setView("courses")}>Make another quiz</button></section></main>}
    <Footer/></div>;
}

