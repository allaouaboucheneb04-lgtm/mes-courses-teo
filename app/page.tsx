"use client";
import { useEffect, useMemo, useState } from "react";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
type Course = {
  id: string;
  type: "taxi" | "adapte";
  date: string;
  amount: number;
  tip: number;
  payment: string;
  duration?: number;
  billedDuration?: number;
  hob?: string;
  perception?: number;
  start?: string;
  end?: string;
  teoId?: string;
  taxiCategory?: "centre-ville" | "aeroport";
  verified?: boolean;
  verifiedBillId?: string;
  verifiedAt?: string;
};
type PayRow = {
  key: string;
  type: "taxi" | "adapte";
  date: string;
  amount: number;
  tip: number;
};
type PayStatement = {
  id: string;
  fileName: string;
  importedAt: string;
  invoiceDate: string;
  periodStart: string;
  periodEnd: string;
  subtotal: number;
  total: number;
  paidDate: string;
  paidAmount: number;
  amountDue: number;
  rows: PayRow[];
  rawText: string;
};
type AppSettings = {
  cardFee: number;
  machineFee: number;
  adaptedRate: number;
  adaptedMinimum: number;
  adaptedFee: number;
  airportFee: number;
  airportEnabled: boolean;
  adaptedEnabled: boolean;
  dailyGoalEnabled: boolean;
  dailyGoalMode: "same" | "custom";
  dailyGoals: number[];
  companyFee: number;
};
const DEFAULT_SETTINGS: AppSettings = {
  cardFee: 5.51,
  machineFee: 2.5,
  adaptedRate: 59.46,
  adaptedMinimum: 2,
  adaptedFee: 13.797,
  airportFee: 6.44,
  airportEnabled: true,
  adaptedEnabled: true,
  dailyGoalEnabled: false,
  dailyGoalMode: "same",
  dailyGoals: [250, 250, 250, 250, 250, 250, 250],
  companyFee: 0,
};
const GOAL_DAYS = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
];
const money = (v: number) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(
    v || 0,
  );
const parseMoneyInput = (value: string) =>
  Number(value.trim().replace(/\s/g, "").replace(",", ".")) || 0;
const autoCommaMoneyInput = (value: string) => {
  const digits = value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (!digits) return "";
  const padded = digits.padStart(3, "0");
  return `${padded.slice(0, -2)},${padded.slice(-2)}`;
};
const formatMoneyInput = (value: string | number) => {
  if (value === "") return "";
  return parseMoneyInput(String(value)).toFixed(2).replace(".", ",");
};
const today = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const dateParts = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );

  return `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
};
const isCardPayment = (payment: string) =>
  payment === "Carte" ||
  payment === "Téo / compte" ||
  payment === "Téo / carte";
const normalizeHob = (value?: string) =>
  (value || "").trim().toUpperCase().replace(/\s+/g, "");
const round2 = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;
const serviceFee = (course: Course, settings: AppSettings) => {
  const gross = course.amount + course.tip;
  if (course.type === "adapte")
    return round2((course.amount * settings.adaptedFee) / 100);
  let fee = 0;
  if (isCardPayment(course.payment)) fee = (gross * settings.cardFee) / 100;
  else if (course.payment === "Machine crédit" || course.payment === "Autre")
    fee = (gross * settings.machineFee) / 100;
  return round2(fee);
};
const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const currentTuesdayWeek = () => {
  const now = new Date(),
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - ((start.getDay() - 2 + 7) % 7));
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start: dateKey(start), end: dateKey(end) };
};
const currentMondayWeek = () => {
  const now = new Date(),
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - ((start.getDay() - 1 + 7) % 7));
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const invoice = new Date(end);
  invoice.setDate(invoice.getDate() + 1);
  return {
    start: dateKey(start),
    end: dateKey(end),
    invoice: dateKey(invoice),
  };
};
const tuesdayWeekKey = (date: string) => {
  const day = new Date(date + "T12:00");
  day.setDate(day.getDate() - ((day.getDay() - 2 + 7) % 7));
  return dateKey(day);
};
export default function Home() {
  const [tab, setTab] = useState<"taxi" | "adapte" | "paie" | "settings">(
      "taxi",
    ),
    [courses, setCourses] = useState<Course[]>([]),
    [loaded, setLoaded] = useState(false),
    [notice, setNotice] = useState("");
  const [payRows, setPayRows] = useState<PayRow[]>([]),
    [payFile, setPayFile] = useState(""),
    [payLoading, setPayLoading] = useState(false),
    [payError, setPayError] = useState(""),
    [payStatements, setPayStatements] = useState<PayStatement[]>([]),
    [selectedStatementId, setSelectedStatementId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [mobilePage, setMobilePage] = useState<
    "add" | "history" | "pay" | "settings"
  >("add");
  const [taxi, setTaxi] = useState({
    date: today(),
    amount: "",
    tip: "",
    payment: "Téo / carte",
    category: "centre-ville" as "centre-ville" | "aeroport",
  });
  const [adapted, setAdapted] = useState({
    date: today(),
    hob: "",
    start: "09:00",
    end: "10:00",
    perception: "",
  });
  const [historyType, setHistoryType] = useState<"all" | "taxi" | "adapte">(
      "all",
    ),
    [historyPeriod, setHistoryPeriod] = useState<
      "week" | "last-week" | "month" | "last-month" | "custom" | "all"
    >("week"),
    [historySearch, setHistorySearch] = useState(""),
    [customStart, setCustomStart] = useState(currentTuesdayWeek().start),
    [customEnd, setCustomEnd] = useState(today());
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "" });
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [syncState, setSyncState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  useEffect(() => {
    return onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });
  }, []);
  useEffect(() => {
    if (!authReady || !user) { setLoaded(false); return; }
    let cancelled = false;
    const loadDriverData = async () => {
      setLoaded(false);
      try {
        const stateRef = doc(db, "drivers", user.uid, "data", "app");
        const snapshot = await getDoc(stateRef);
        if (cancelled) return;
        if (snapshot.exists()) {
          const remote = snapshot.data();
          setCourses(Array.isArray(remote.courses) ? remote.courses : []);
          setSettings({ ...DEFAULT_SETTINGS, ...(remote.settings || {}) });
          setPayStatements(Array.isArray(remote.payStatements) ? remote.payStatements : []);
        } else {
          const localCourses = JSON.parse(localStorage.getItem("teo-courses") || "[]") as Course[];
          const localSettings = JSON.parse(localStorage.getItem("teo-settings") || "{}") as Partial<AppSettings>;
          const localStatements = JSON.parse(localStorage.getItem("teo-pay-statements") || "[]") as PayStatement[];
          const migratedSettings = { ...DEFAULT_SETTINGS, ...localSettings };
          setCourses(localCourses); setSettings(migratedSettings); setPayStatements(localStatements);
          await setDoc(stateRef, { courses: localCourses, settings: migratedSettings, payStatements: localStatements, ownerEmail: user.email || "", updatedAt: serverTimestamp() });
          localStorage.removeItem("teo-courses"); localStorage.removeItem("teo-settings"); localStorage.removeItem("teo-pay-statements");
        }
        if (!cancelled) { setLoaded(true); setSyncState("saved"); }
      } catch (error) {
        console.error(error);
        if (!cancelled) { setAuthMessage("Impossible de charger vos données. Vérifiez la configuration Firestore."); setSyncState("error"); }
      }
    };
    loadDriverData();
    return () => { cancelled = true; };
  }, [authReady, user]);
  useEffect(() => {
    if (!loaded || !user) return;
    setSyncState("saving");
    const timer = window.setTimeout(async () => {
      try {
        await setDoc(doc(db, "drivers", user.uid, "data", "app"), { courses, settings, payStatements, ownerEmail: user.email || "", updatedAt: serverTimestamp() }, { merge: true });
        setSyncState("saved");
      } catch (error) { console.error(error); setSyncState("error"); }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [courses, settings, payStatements, loaded, user]);
  useEffect(() => {
    if (!settings.adaptedEnabled && tab === "adapte") setTab("taxi");
    if (!settings.airportEnabled && taxi.category === "aeroport")
      setTaxi((current) => ({ ...current, category: "centre-ville" }));
  }, [settings.adaptedEnabled, settings.airportEnabled, tab, taxi.category]);
  useEffect(() => {
    if (!loaded || !payStatements.length) return;
    setCourses((current) => {
      let changed = false;
      const updated = current.map((course) => {
        let matchedStatement: PayStatement | undefined;
        let matchedRow: PayRow | undefined;
        for (const statement of payStatements) {
          const row = statement.rows.find(
            (item) =>
              item.type === course.type &&
              item.date === course.date &&
              (course.type === "adapte"
                ? normalizeHob(item.key) === normalizeHob(course.hob)
                : !course.teoId || item.key === course.teoId) &&
              Math.abs(item.amount - course.amount) < 0.02 &&
              Math.abs(item.tip - course.tip) < 0.02,
          );
          if (row) {
            matchedStatement = statement;
            matchedRow = row;
            break;
          }
        }
        if (!matchedStatement || !matchedRow) return course;
        if (
          course.verified &&
          course.verifiedBillId === matchedStatement.id &&
          (course.type !== "taxi" || course.teoId === matchedRow.key)
        )
          return course;
        changed = true;
        return {
          ...course,
          teoId: course.type === "taxi" ? matchedRow.key : course.teoId,
          verified: true,
          verifiedBillId: matchedStatement.id,
          verifiedAt: course.verifiedAt || matchedStatement.importedAt,
        };
      });
      return changed ? updated : current;
    });
  }, [loaded, payStatements]);
  const week = useMemo(currentTuesdayWeek, []),
    weeklyCourses = useMemo(
      () => courses.filter((c) => c.date >= week.start && c.date <= week.end),
      [courses, week],
    );
  const airportWeek = useMemo(currentMondayWeek, []);
  const weeklyAirportCourses = useMemo(
    () =>
      courses.filter(
        (course) =>
          course.type === "taxi" &&
          course.taxiCategory === "aeroport" &&
          course.date >= airportWeek.start &&
          course.date <= airportWeek.end,
      ),
    [courses, airportWeek],
  );
  const airportFeeTotal = round2(
    weeklyAirportCourses.length * settings.airportFee,
  );
  const weeklyCompanyFee = round2(settings.companyFee);
  const totals = useMemo(
    () =>
      weeklyCourses.reduce(
        (a, c) => {
          const gross = c.amount + c.tip;
          return {
            gross: a.gross + gross,
            deductions:
              a.deductions + serviceFee(c, settings) + (c.perception || 0),
            duration: a.duration + (c.duration || 0),
          };
        },
        { gross: 0, deductions: 0, duration: 0 },
      ),
    [weeklyCourses, settings],
  );
  const filteredHistory = useMemo(() => {
    const query = historySearch.trim().toUpperCase();
    const now = new Date(),
      monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    const lastWeekStart = new Date(week.start + "T12:00");
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekEnd = new Date(lastWeekStart);
    lastWeekEnd.setDate(lastWeekEnd.getDate() + 6);
    const bounds =
      historyPeriod === "week"
        ? [week.start, week.end]
        : historyPeriod === "last-week"
          ? [dateKey(lastWeekStart), dateKey(lastWeekEnd)]
          : historyPeriod === "month"
            ? [dateKey(monthStart), today()]
            : historyPeriod === "last-month"
              ? [dateKey(lastMonthStart), dateKey(lastMonthEnd)]
              : historyPeriod === "custom"
                ? [customStart, customEnd]
                : null;
    return courses
      .filter(
        (c) =>
          (!bounds || (c.date >= bounds[0] && c.date <= bounds[1])) &&
          (historyType === "all" || c.type === historyType) &&
          (!query ||
            c.hob?.toUpperCase().includes(query) ||
            c.payment.toUpperCase().includes(query)),
      )
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [
    courses,
    historyPeriod,
    historyType,
    historySearch,
    week,
    customStart,
    customEnd,
  ]);
  const historyTotals = useMemo(
    () =>
      filteredHistory.reduce(
        (sum, c) => ({
          gross: sum.gross + c.amount + c.tip,
          tips: sum.tips + c.tip,
          fees: sum.fees + serviceFee(c, settings) + (c.perception || 0),
        }),
        { gross: 0, tips: 0, fees: 0 },
      ),
    [filteredHistory, settings],
  );
  const historyAirportFeeTotal = useMemo(
    () =>
      round2(
        filteredHistory.filter(
          (course) =>
            course.type === "taxi" && course.taxiCategory === "aeroport",
        ).length * settings.airportFee,
      ),
    [filteredHistory, settings.airportFee],
  );
  const historyCompanyFeeTotal = useMemo(
    () =>
      round2(
        new Set(filteredHistory.map((course) => tuesdayWeekKey(course.date)))
          .size * settings.companyFee,
      ),
    [filteredHistory, settings.companyFee],
  );
  const unverifiedHistoryCount = useMemo(
    () =>
      filteredHistory.filter(
        (course) =>
          !course.verified &&
          (course.type === "adapte" || isCardPayment(course.payment)),
      ).length,
    [filteredHistory],
  );
  const selectedDate = tab === "adapte" ? adapted.date : taxi.date;
  const selectedDayCourses = useMemo(
    () => courses.filter((c) => c.date === selectedDate),
    [courses, selectedDate],
  );
  const selectedDayTotals = useMemo(
    () =>
      selectedDayCourses.reduce(
        (sum, c) => ({
          gross: sum.gross + c.amount + c.tip,
          tips: sum.tips + c.tip,
          fees: sum.fees + serviceFee(c, settings) + (c.perception || 0),
        }),
        { gross: 0, tips: 0, fees: 0 },
      ),
    [selectedDayCourses, settings],
  );
  const selectedDayAirportFeeTotal = round2(
    selectedDayCourses.filter(
      (course) => course.type === "taxi" && course.taxiCategory === "aeroport",
    ).length * settings.airportFee,
  );
  const selectedDayCompanyFee =
    new Date(selectedDate + "T12:00").getDay() === 2
      ? round2(settings.companyFee)
      : 0;
  const selectedGoalDay = (new Date(selectedDate + "T12:00").getDay() + 6) % 7;
  const dailyGoal = settings.dailyGoals[selectedGoalDay] || 0;
  const dailyNet = round2(
    selectedDayTotals.gross -
      selectedDayTotals.fees -
      selectedDayAirportFeeTotal -
      selectedDayCompanyFee,
  );
  const dailyGoalProgress = dailyGoal
    ? Math.min(100, Math.max(0, (dailyNet / dailyGoal) * 100))
    : 0;
  const comparisons = useMemo(() => {
    const used = new Set<string>();
    const payDates = payRows.map((row) => row.date).sort();
    let payStart = payDates[0];
    let payEnd = payDates[payDates.length - 1];
    if (payStart && payEnd) {
      const firstDay = new Date(`${payStart}T12:00`);
      firstDay.setDate(firstDay.getDate() - ((firstDay.getDay() - 2 + 7) % 7));
      const lastDay = new Date(`${payEnd}T12:00`);
      lastDay.setDate(lastDay.getDate() + ((1 - lastDay.getDay() + 7) % 7));
      payStart = dateKey(firstDay);
      payEnd = dateKey(lastDay);
    }
    const rows = payRows.map((row) => {
      const candidates = courses.filter(
        (c) =>
          !used.has(c.id) &&
          (row.type === "adapte"
            ? c.type === "adapte" &&
              normalizeHob(c.hob) === normalizeHob(row.key) &&
              c.date === row.date
            : c.type === "taxi" &&
              isCardPayment(c.payment) &&
              (c.teoId === row.key || (!c.teoId && c.date === row.date))),
      );
      const difference = (c: Course) =>
        Math.abs(c.amount - row.amount) +
        (row.type === "taxi" ? Math.abs(c.tip - row.tip) : 0);
      let course = candidates.find((c) => difference(c) < 0.02);
      if (!course && candidates.length)
        course = candidates.sort((a, b) => difference(a) - difference(b))[0];
      if (!course)
        return {
          ...row,
          status: "missing-app" as const,
          appAmount: null,
          appTip: null,
          courseId: null,
        };
      used.add(course.id);
      return {
        ...row,
        status:
          difference(course) < 0.02 ? ("ok" as const) : ("different" as const),
        appAmount: course.amount,
        appTip: course.tip,
        courseId: course.id,
      };
    });
    for (const c of courses) {
      if (
        !payStart ||
        c.date < payStart ||
        c.date > payEnd ||
        used.has(c.id) ||
        !(c.type === "adapte" || isCardPayment(c.payment))
      )
        continue;
      rows.push({
        key:
          c.type === "adapte" ? c.hob || "Sans HOB" : c.teoId || "Course carte",
        type: c.type,
        date: c.date,
        amount: 0,
        tip: 0,
        status: "missing-pay" as const,
        appAmount: c.amount,
        appTip: c.tip,
        courseId: c.id,
      });
    }
    return rows;
  }, [payRows, courses]);
  const statementWarnings = useMemo(() => {
    const warnings: Record<string, number> = {};
    for (const statement of payStatements) {
      const dates = statement.rows.map((row) => row.date).sort();
      if (!dates.length) {
        warnings[statement.id] = 0;
        continue;
      }
      const start = new Date(`${dates[0]}T12:00`);
      start.setDate(start.getDate() - ((start.getDay() - 2 + 7) % 7));
      const end = new Date(`${dates[dates.length - 1]}T12:00`);
      end.setDate(end.getDate() + ((1 - end.getDay() + 7) % 7));
      const usedRows = new Set<number>();
      let missing = 0;
      for (const course of courses.filter(
        (item) =>
          item.date >= dateKey(start) &&
          item.date <= dateKey(end) &&
          (item.type === "adapte" || isCardPayment(item.payment)),
      )) {
        const candidate = statement.rows
          .map((row, index) => ({ row, index }))
          .filter(
            ({ row, index }) =>
              !usedRows.has(index) &&
              row.type === course.type &&
              row.date === course.date &&
              (course.type === "taxi"
                ? !course.teoId || row.key === course.teoId
                : normalizeHob(row.key) === normalizeHob(course.hob)),
          )
          .sort(
            (a, b) =>
              Math.abs(a.row.amount - course.amount) +
              Math.abs(a.row.tip - course.tip) -
              (Math.abs(b.row.amount - course.amount) +
                Math.abs(b.row.tip - course.tip)),
          )[0];
        if (candidate) {
          usedRows.add(candidate.index);
          const amountDifference = Math.abs(
            candidate.row.amount - course.amount,
          );
          const tipDifference =
            course.type === "taxi"
              ? Math.abs(candidate.row.tip - course.tip)
              : 0;
          if (amountDifference + tipDifference >= 0.02) missing++;
        } else missing++;
      }
      warnings[statement.id] = missing;
    }
    return warnings;
  }, [payStatements, courses]);
  const flash = (t: string) => {
    setNotice(t);
    window.setTimeout(() => setNotice(""), 2400);
  };
  function changeCoursePayment(courseId: string, payment: string) {
    setCourses((current) =>
      current.map((course) =>
        course.id === courseId ? { ...course, payment } : course,
      ),
    );
    flash("Mode de paiement modifié.");
  }
  function correctFromTeo(row: (typeof comparisons)[number]) {
    if (!row.courseId || row.status !== "different") return;
    setCourses((current) =>
      current.map((course) =>
        course.id === row.courseId
          ? {
              ...course,
              amount: row.amount,
              tip: row.tip,
              teoId: row.type === "taxi" ? row.key : course.teoId,
              verified: true,
              verifiedBillId: selectedStatementId,
              verifiedAt: new Date().toISOString(),
            }
          : course,
      ),
    );
    flash("Course corrigée selon la fiche Téo.");
  }
  function deleteCheckedCourse(courseId: string) {
    if (!window.confirm("Supprimer cette course de l’application?")) return;
    setCourses((current) => current.filter((course) => course.id !== courseId));
    flash("Course supprimée.");
  }
  function savePayRow(row: PayRow) {
    const billedDuration =
      row.type === "adapte"
        ? Math.max(row.amount / settings.adaptedRate, settings.adaptedMinimum)
        : undefined;
    const course: Course = {
      id: crypto.randomUUID(),
      type: row.type,
      date: row.date,
      amount: row.amount,
      tip: row.tip,
      payment: row.type === "taxi" ? "Téo / carte" : "Transport adapté",
      teoId: row.type === "taxi" ? row.key : undefined,
      taxiCategory: row.type === "taxi" ? "centre-ville" : undefined,
      hob: row.type === "adapte" ? row.key : undefined,
      duration: billedDuration,
      billedDuration,
      perception: 0,
      verified: true,
      verifiedBillId: selectedStatementId,
      verifiedAt: new Date().toISOString(),
    };
    setCourses([course, ...courses]);
    flash(
      `${row.type === "taxi" ? "Course" : "Tournée"} ${row.key} enregistrée.`,
    );
  }
  function editCourse(course: Course) {
    setEditingId(course.id);
    setMobilePage("add");
    if (course.type === "taxi") {
      setTaxi({
        date: course.date,
        amount: formatMoneyInput(course.amount),
        tip: course.tip ? formatMoneyInput(course.tip) : "",
        payment: isCardPayment(course.payment) ? "Téo / carte" : course.payment,
        category: course.taxiCategory || "centre-ville",
      });
      setTab("taxi");
    } else {
      const start = course.start || "09:00";
      const fallbackEnd = new Date(`2000-01-01T${start}:00`);
      fallbackEnd.setMinutes(
        fallbackEnd.getMinutes() + Math.round((course.duration || 2) * 60),
      );
      setAdapted({
        date: course.date,
        hob: course.hob || "",
        start,
        end:
          course.end ||
          `${String(fallbackEnd.getHours()).padStart(2, "0")}:${String(fallbackEnd.getMinutes()).padStart(2, "0")}`,
        perception: course.perception
          ? formatMoneyInput(course.perception)
          : "",
      });
      setTab("adapte");
    }
    window.scrollTo({ top: 190, behavior: "smooth" });
  }
  function cancelEdit() {
    setEditingId(null);
    setTaxi({
      date: today(),
      amount: "",
      tip: "",
      payment: "Téo / carte",
      category: "centre-ville",
    });
    setAdapted({
      date: today(),
      hob: "",
      start: "09:00",
      end: "10:00",
      perception: "",
    });
  }
  async function importPayPdf(file?: File) {
    if (!file) return;
    setPayLoading(true);
    setPayError("");
    setPayRows([]);
    setPayFile(file.name);
    try {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const doc = await pdfjs.getDocument({
        data: new Uint8Array(await file.arrayBuffer()),
      }).promise;
      let text = "";
      for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
        const content = await (await doc.getPage(pageNo)).getTextContent();
        text +=
          (content.items as Array<{ str?: string }>)
            .map((item) => item.str || "")
            .join(" ") + "\n";
      }
      const tips = new Map<string, number>(),
        tipRows = /\[TIPC\][\s\S]*?\((\d+A) to[^)]*\)[\s\S]*?\s1\s+([\d,]+)/g;
      let match: RegExpExecArray | null;
      while ((match = tipRows.exec(text)))
        tips.set(match[1], Number(match[2].replace(",", ".")));
      const rows: PayRow[] = [],
        regular =
          /\[CRD\][\s\S]*?\((\d+A) to[^)]*\)\s+Date:\s+(\d{2})\/(\d{2})\/(\d{4})\s+\d{2}:\d{2}:\d{2}\s+1\s+([\d,]+)/g;
      while ((match = regular.exec(text)))
        rows.push({
          key: match[1],
          type: "taxi",
          date: `${match[4]}-${match[3]}-${match[2]}`,
          amount: Number(match[5].replace(",", ".")),
          tip: tips.get(match[1]) || 0,
        });
      const adaptedRows =
        /\[PTR\][\s\S]*?\((HOB\d{4})_(\d{2})\/(\d{2})\/(\d{4}) to[^)]*\)[\s\S]*?\s1\s+([\d,]+)\s+TPS/g;
      while ((match = adaptedRows.exec(text)))
        rows.push({
          key: match[1],
          type: "adapte",
          date: `${match[4]}-${match[3]}-${match[2]}`,
          amount: Number(match[5].replace(",", ".")),
          tip: 0,
        });
      if (!rows.length) throw new Error("Aucune course reconnue");
      const valueAfter = (label: RegExp) => {
        const found = text.match(label);
        return found
          ? Number(found[1].replace(/\s/g, "").replace(",", "."))
          : 0;
      };
      const billId = text.match(/Facture fournisseur\s+(BILL\d+)/i)?.[1];
      if (!billId) throw new Error("Numéro BILL introuvable");
      const invoiceDate =
        text.match(
          /Date de la facture[\s\S]{0,180}?(\d{4}-\d{2}-\d{2})/i,
        )?.[1] || "";
      const paid = text.match(
        /Payé le\s+(\d{4}-\d{2}-\d{2})\s+([\d\s]+,\d{2})\s*\$/i,
      );
      const dates = rows.map((row) => row.date).sort();
      const statement: PayStatement = {
        id: billId,
        fileName: file.name,
        importedAt: new Date().toISOString(),
        invoiceDate,
        periodStart: dates[0] || "",
        periodEnd: dates[dates.length - 1] || "",
        subtotal: valueAfter(/Sous-total\s+([\d\s]+,\d{2})\s*\$/i),
        total: valueAfter(/(?:^|\s)Total\s+([\d\s]+,\d{2})\s*\$/im),
        paidDate: paid?.[1] || "",
        paidAmount: paid
          ? Number(paid[2].replace(/\s/g, "").replace(",", "."))
          : 0,
        amountDue: valueAfter(/Montant dû\s+([\d\s]+,\d{2})\s*\$/i),
        rows,
        rawText: text,
      };
      setPayRows(rows);
      setSelectedStatementId(billId);
      setPayStatements((current) => [
        statement,
        ...current.filter((item) => item.id !== billId),
      ]);
      setCourses((current) => {
        const linked = new Set<string>();
        return current.map((course) => {
          const row = rows.find(
            (item) =>
              item.type === course.type &&
              !linked.has(`${item.type}-${item.key}`) &&
              item.date === course.date &&
              (course.type === "adapte"
                ? item.key === course.hob
                : !course.teoId || item.key === course.teoId) &&
              Math.abs(item.amount - course.amount) < 0.02 &&
              Math.abs(item.tip - course.tip) < 0.02,
          );
          if (!row) return course;
          linked.add(`${row.type}-${row.key}`);
          return {
            ...course,
            teoId: row.type === "taxi" ? row.key : course.teoId,
            verified: true,
            verifiedBillId: billId,
            verifiedAt: new Date().toISOString(),
          };
        });
      });
      flash(`Fiche ${billId} enregistrée avec tous ses détails.`);
    } catch {
      setPayError(
        "Impossible de lire cette fiche. Vérifiez qu’il s’agit d’un relevé PDF Téo.",
      );
    } finally {
      setPayLoading(false);
    }
  }
  function addTaxi(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseMoneyInput(taxi.amount);
    if (!amount || amount < 0) return flash("Entrez un montant valide.");
    const updated: Course = {
      id: editingId || crypto.randomUUID(),
      type: "taxi",
      date: taxi.date,
      amount,
      tip: parseMoneyInput(taxi.tip),
      payment: taxi.payment,
      taxiCategory: taxi.category,
    };
    setCourses(
      editingId
        ? courses.map((c) => (c.id === editingId ? updated : c))
        : [updated, ...courses],
    );
    const wasEditing = Boolean(editingId);
    setEditingId(null);
    setTaxi({ ...taxi, amount: "", tip: "" });
    flash(wasEditing ? "Course taxi modifiée." : "Course taxi ajoutée.");
  }
  function addAdapted(e: React.FormEvent) {
    e.preventDefault();
    const hob = adapted.hob.toUpperCase().trim();
    if (!/^HOB\d{4}$/.test(hob))
      return flash("Le numéro doit ressembler à HOB1045.");
    const start = new Date(`${adapted.date}T${adapted.start}`);
    let end = new Date(`${adapted.date}T${adapted.end}`);
    if (end <= start) end = new Date(end.getTime() + 86400000);
    const duration =
      Math.round((end.getTime() - start.getTime()) / 36000) / 100;
    if (!duration || duration > 24)
      return flash("Vérifiez les heures saisies.");
    const billedDuration = Math.max(duration, settings.adaptedMinimum);
    const updated: Course = {
      id: editingId || crypto.randomUUID(),
      type: "adapte",
      date: adapted.date,
      amount: round2(billedDuration * settings.adaptedRate),
      tip: 0,
      payment: "Transport adapté",
      duration,
      billedDuration,
      hob,
      perception: parseMoneyInput(adapted.perception),
      start: adapted.start,
      end: adapted.end,
    };
    setCourses(
      editingId
        ? courses.map((c) => (c.id === editingId ? updated : c))
        : [updated, ...courses],
    );
    const wasEditing = Boolean(editingId);
    setEditingId(null);
    setAdapted({ ...adapted, hob: "", perception: "" });
    flash(
      wasEditing
        ? "Tournée modifiée."
        : `Transport ajouté · ${billedDuration.toFixed(2)} h payées.`,
    );
  }
  const firebaseErrorMessage = (error: unknown) => {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code.includes("email-already-in-use")) return "Ce courriel possède déjà un compte.";
    if (code.includes("invalid-credential")) return "Courriel ou mot de passe incorrect.";
    if (code.includes("weak-password")) return "Le mot de passe doit contenir au moins 6 caractères.";
    if (code.includes("invalid-email")) return "Entrez une adresse courriel valide.";
    if (code.includes("popup-closed")) return "La connexion Google a été annulée.";
    if (code.includes("unauthorized-domain")) return "Ce domaine doit être autorisé dans Firebase Authentication.";
    return "La connexion a échoué. Réessayez.";
  };
  const submitAuth = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setAuthBusy(true); setAuthMessage("");
    try {
      if (authMode === "register") {
        const credential = await createUserWithEmailAndPassword(auth, authForm.email.trim(), authForm.password);
        if (authForm.name.trim()) await updateProfile(credential.user, { displayName: authForm.name.trim() });
      } else await signInWithEmailAndPassword(auth, authForm.email.trim(), authForm.password);
    } catch (error) { setAuthMessage(firebaseErrorMessage(error)); }
    finally { setAuthBusy(false); }
  };
  const connectGoogle = async () => {
    setAuthBusy(true); setAuthMessage("");
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (error) { setAuthMessage(firebaseErrorMessage(error)); }
    finally { setAuthBusy(false); }
  };
  const resetPassword = async () => {
    if (!authForm.email.trim()) { setAuthMessage("Entrez d’abord votre courriel."); return; }
    setAuthBusy(true);
    try { await sendPasswordResetEmail(auth, authForm.email.trim()); setAuthMessage("Le courriel de réinitialisation a été envoyé."); }
    catch (error) { setAuthMessage(firebaseErrorMessage(error)); }
    finally { setAuthBusy(false); }
  };
  if (!authReady) return <main className="auth-page"><div className="auth-loader">Chargement…</div></main>;
  if (!user) return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand"><span className="mark">T</span><div><h1>Mes courses</h1><p>Téo Taxi · Montréal</p></div></div>
        <div className="auth-heading"><span>{authMode === "login" ? "Bon retour" : "Nouveau chauffeur"}</span><h2>{authMode === "login" ? "Se connecter" : "Créer un compte"}</h2><p>Connectez-vous pour accéder à vos courses et à vos fiches de paie.</p></div>
        <button className="google-button" type="button" disabled={authBusy} onClick={connectGoogle}><span>G</span> Continuer avec Google</button>
        <div className="auth-divider"><span>ou avec votre courriel</span></div>
        <form className="auth-form" onSubmit={submitAuth}>
          {authMode === "register" && <label>Nom du chauffeur<input required autoComplete="name" value={authForm.name} onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })} placeholder="Votre nom" /></label>}
          <label>Courriel<input required type="email" autoComplete="email" value={authForm.email} onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })} placeholder="nom@exemple.com" /></label>
          <label>Mot de passe<input required minLength={6} type="password" autoComplete={authMode === "login" ? "current-password" : "new-password"} value={authForm.password} onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} placeholder="6 caractères minimum" /></label>
          {authMessage && <p className="auth-message" role="status">{authMessage}</p>}
          <button className="auth-submit" disabled={authBusy}>{authBusy ? "Un instant…" : authMode === "login" ? "Se connecter" : "Créer mon compte"}</button>
        </form>
        {authMode === "login" && <button className="auth-link" type="button" onClick={resetPassword}>Mot de passe oublié?</button>}
        <div className="auth-switch"><span>{authMode === "login" ? "Première visite?" : "Vous avez déjà un compte?"}</span><button type="button" onClick={() => { setAuthMode(authMode === "login" ? "register" : "login"); setAuthMessage(""); }}>{authMode === "login" ? "Créer un compte" : "Se connecter"}</button></div>
      </section>
    </main>
  );
  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <span className="mark">T</span>
          <div>
            <h1>Mes courses</h1>
            <p>Téo Taxi · Montréal</p>
          </div>
        </div>
        <div className="account-pill" title={user.email || "Compte chauffeur"}>
          <span>{(user.displayName || user.email || "C").charAt(0).toUpperCase()}</span>
          <div><b>{user.displayName || "Chauffeur"}</b><small>{syncState === "saving" ? "Enregistrement…" : syncState === "error" ? "Erreur de sauvegarde" : "Données enregistrées"}</small></div>
        </div>
      </header>
      <div className={`shell page-${mobilePage}`}>
        <section className="summary">
          <div>
            <span>Revenu net de la semaine</span>
            <strong>
              {money(
                totals.gross -
                  totals.deductions -
                  airportFeeTotal -
                  weeklyCompanyFee,
              )}
            </strong>
            <small>
              Mardi{" "}
              {new Date(week.start + "T12:00").toLocaleDateString("fr-CA", {
                day: "numeric",
                month: "short",
              })}{" "}
              au lundi{" "}
              {new Date(week.end + "T12:00").toLocaleDateString("fr-CA", {
                day: "numeric",
                month: "short",
              })}{" "}
              · {weeklyCourses.length} course
              {weeklyCourses.length !== 1 ? "s" : ""}
            </small>
            {settings.dailyGoalEnabled && (
              <div className="daily-goal">
                <div>
                  <span>
                    Objectif du {GOAL_DAYS[selectedGoalDay].toLowerCase()}
                  </span>
                  <b>
                    {money(dailyNet)} / {money(dailyGoal)}
                  </b>
                </div>
                <div
                  className="goal-progress"
                  role="progressbar"
                  aria-label="Progression de l’objectif du jour"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(dailyGoalProgress)}
                >
                  <i style={{ width: `${dailyGoalProgress}%` }} />
                </div>
                <small>
                  {dailyGoal > 0 && dailyNet >= dailyGoal
                    ? "Objectif atteint ✓"
                    : `${money(Math.max(0, dailyGoal - dailyNet))} restant`}
                </small>
              </div>
            )}
          </div>
          <div className="mini">
            <span>Revenu brut</span>
            <b>{money(totals.gross)}</b>
          </div>
          <div className="mini fee">
            <span>Frais et perceptions</span>
            <b>
              − {money(totals.deductions + airportFeeTotal + weeklyCompanyFee)}
            </b>
            {weeklyCompanyFee > 0 && (
              <small>
                dont {money(weeklyCompanyFee)} de frais de compagnie
              </small>
            )}
          </div>
        </section>
        <section className="workspace" id="workspace">
          <div
            className={`tabs ${!settings.adaptedEnabled ? "no-adapted" : ""}`}
          >
            <button
              className={tab === "taxi" ? "active" : ""}
              onClick={() => {
                setEditingId(null);
                setTab("taxi");
              }}
            >
              Course taxi
            </button>
            {settings.adaptedEnabled && (
              <button
                className={tab === "adapte" ? "active" : ""}
                onClick={() => {
                  setEditingId(null);
                  setTab("adapte");
                }}
              >
                Transport adapté
              </button>
            )}
            <button
              className={tab === "paie" ? "active" : ""}
              onClick={() => {
                setEditingId(null);
                setTab("paie");
              }}
            >
              Vérifier paie
            </button>
            <button
              className={tab === "settings" ? "active" : ""}
              onClick={() => {
                setEditingId(null);
                setTab("settings");
              }}
            >
              Réglages
            </button>
          </div>
          {tab === "taxi" ? (
            <form onSubmit={addTaxi} className="form-card">
              <div className="form-title">
                <div>
                  <h2>
                    {editingId
                      ? "Modifier la course taxi"
                      : "Nouvelle course taxi"}
                  </h2>
                  <p>Ajoutez les montants affichés dans Téo.</p>
                </div>
                <span className="type-icon">$</span>
              </div>
              <label>
                Date
                <input
                  type="date"
                  value={taxi.date}
                  onChange={(e) => setTaxi({ ...taxi, date: e.target.value })}
                  required
                />
              </label>
              {settings.airportEnabled && (
                <label>
                  Type de course régulière
                  <select
                    value={taxi.category}
                    onChange={(e) =>
                      setTaxi({
                        ...taxi,
                        category: e.target.value as typeof taxi.category,
                      })
                    }
                  >
                    <option value="centre-ville">Centre-ville</option>
                    <option value="aeroport">Aéroport</option>
                  </select>
                </label>
              )}
              <div className="two">
                <label>
                  Montant de la course
                  <div className="money-input">
                    <span>$</span>
                    <input
                      inputMode="decimal"
                      placeholder="0,00"
                      value={taxi.amount}
                      onChange={(e) =>
                        setTaxi({
                          ...taxi,
                          amount: autoCommaMoneyInput(e.target.value),
                        })
                      }
                    />
                  </div>
                </label>
                <label>
                  Pourboire
                  <div className="money-input">
                    <span>$</span>
                    <input
                      inputMode="decimal"
                      placeholder="0,00"
                      value={taxi.tip}
                      onChange={(e) =>
                        setTaxi({
                          ...taxi,
                          tip: autoCommaMoneyInput(e.target.value),
                        })
                      }
                    />
                  </div>
                </label>
              </div>
              <label>
                Mode de paiement
                <select
                  value={taxi.payment}
                  onChange={(e) =>
                    setTaxi({ ...taxi, payment: e.target.value })
                  }
                >
                  <option>Téo / carte</option>
                  <option>Espèces</option>
                  <option>Coupon</option>
                  <option>Machine crédit</option>
                </select>
              </label>
              {taxi.category === "aeroport" && (
                <div className="airport-fee-note">
                  Redevance de <b>{money(settings.airportFee)}</b> comptabilisée
                  à la fin de la semaine, sans déduction sur cette course.
                </div>
              )}
              {settings.airportEnabled && (
                <div className="airport-week-card">
                  <div>
                    <span>Total à déduire</span>
                    <b>
                      {weeklyAirportCourses.length} course
                      {weeklyAirportCourses.length !== 1 ? "s" : ""} ·{" "}
                      {money(weeklyAirportCourses.length * settings.airportFee)}
                    </b>
                  </div>
                  <small>
                    Du {airportWeek.start} au {airportWeek.end} · Facture le
                    lundi {airportWeek.invoice}
                  </small>
                </div>
              )}
              <button className="primary">
                {editingId
                  ? "Enregistrer les modifications"
                  : "Ajouter la course"}
              </button>
              {editingId && (
                <button
                  type="button"
                  className="cancel-edit"
                  onClick={cancelEdit}
                >
                  Annuler
                </button>
              )}
            </form>
          ) : tab === "adapte" ? (
            <form onSubmit={addAdapted} className="form-card">
              <div className="form-title">
                <div>
                  <h2>
                    {editingId
                      ? "Modifier la tournée"
                      : "Nouveau transport adapté"}
                  </h2>
                  <p>
                    {money(settings.adaptedRate)}/h · minimum payé de{" "}
                    {settings.adaptedMinimum} heures.
                  </p>
                </div>
                <span className="type-icon">⏱</span>
              </div>
              <label>
                Numéro de course HOB
                <input
                  className="hob-input"
                  value={adapted.hob}
                  maxLength={7}
                  placeholder="HOB1045"
                  autoCapitalize="characters"
                  onChange={(e) =>
                    setAdapted({
                      ...adapted,
                      hob: e.target.value.toUpperCase().replace(/\s/g, ""),
                    })
                  }
                  required
                />
              </label>
              <label>
                Date
                <input
                  type="date"
                  value={adapted.date}
                  onChange={(e) =>
                    setAdapted({ ...adapted, date: e.target.value })
                  }
                  required
                />
              </label>
              <div className="two">
                <label>
                  Heure de début
                  <input
                    type="time"
                    value={adapted.start}
                    onChange={(e) =>
                      setAdapted({ ...adapted, start: e.target.value })
                    }
                    required
                  />
                </label>
                <label>
                  Heure de fin
                  <input
                    type="time"
                    value={adapted.end}
                    onChange={(e) =>
                      setAdapted({ ...adapted, end: e.target.value })
                    }
                    required
                  />
                </label>
              </div>
              <div className="rate-box">
                <div>
                  <span>Tarif brut</span>
                  <b>{money(settings.adaptedRate)} / h</b>
                </div>
                <div>
                  <span>Paiement minimum</span>
                  <b>{money(settings.adaptedRate * settings.adaptedMinimum)}</b>
                </div>
              </div>
              <label>
                Perception STM
                <div className="money-input">
                  <span>$</span>
                  <input
                    inputMode="decimal"
                    placeholder="0,00"
                    value={adapted.perception}
                    onChange={(e) =>
                      setAdapted({
                        ...adapted,
                        perception: autoCommaMoneyInput(e.target.value),
                      })
                    }
                  />
                </div>
              </label>
              <button className="primary">
                {editingId
                  ? "Enregistrer les modifications"
                  : "Calculer et ajouter"}
              </button>
              {editingId && (
                <button
                  type="button"
                  className="cancel-edit"
                  onClick={cancelEdit}
                >
                  Annuler
                </button>
              )}
            </form>
          ) : tab === "paie" ? (
            <div className="form-card reconcile">
              <div className="form-title">
                <div>
                  <h2>Vérifier une fiche de paie</h2>
                  <p>Le PDF est analysé seulement sur votre appareil.</p>
                </div>
                <span className="type-icon">✓</span>
              </div>
              <label className="upload">
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) => importPayPdf(e.target.files?.[0])}
                />
                <span>
                  {payLoading
                    ? "Lecture en cours…"
                    : "Choisir la fiche PDF Téo"}
                </span>
                <small>{payFile || "Courses carte et tournées HOB"}</small>
              </label>
              {payError && <p className="error-box">{payError}</p>}
              {payStatements.length > 0 && (
                <section className="saved-statements">
                  <h3>Fiches de paie enregistrées</h3>
                  {payStatements.map((statement) => (
                    <div
                      className={`saved-statement ${
                        statement.id === selectedStatementId ? "open" : ""
                      }`}
                      key={statement.id}
                    >
                      <button
                        type="button"
                        className={
                          statement.id === selectedStatementId ? "active" : ""
                        }
                        onClick={() => {
                          if (statement.id === selectedStatementId) {
                            setSelectedStatementId("");
                            setPayRows([]);
                            setPayFile("");
                          } else {
                            setSelectedStatementId(statement.id);
                            setPayRows(statement.rows);
                            setPayFile(statement.fileName);
                          }
                        }}
                      >
                        <span>
                          <b>{statement.id}</b>
                          <small>
                            {statement.invoiceDate ||
                              statement.importedAt.slice(0, 10)}{" "}
                            · {statement.rows.length} lignes
                          </small>
                          {Boolean(statementWarnings[statement.id]) && (
                            <em className="statement-warning">
                              ⚠ {statementWarnings[statement.id]} course
                              {statementWarnings[statement.id] > 1 ? "s" : ""} à
                              vérifier
                            </em>
                          )}
                        </span>
                        <span className="statement-total">
                          <strong>{money(statement.total)}</strong>
                          <small>
                            {statement.id === selectedStatementId
                              ? "Fermer ▲"
                              : "Ouvrir ▼"}
                          </small>
                        </span>
                      </button>
                      {statement.id === selectedStatementId && (
                        <>
                          <section className="statement-details inline">
                            <div className="statement-grid">
                              <div>
                                <span>Date de la facture</span>
                                <b>{statement.invoiceDate || "—"}</b>
                              </div>
                              <div>
                                <span>Période des courses</span>
                                <b>
                                  {statement.periodStart} au{" "}
                                  {statement.periodEnd}
                                </b>
                              </div>
                              <div>
                                <span>Sous-total</span>
                                <b>{money(statement.subtotal)}</b>
                              </div>
                              <div>
                                <span>Payé le</span>
                                <b>
                                  {statement.paidDate || "—"} ·{" "}
                                  {money(statement.paidAmount)}
                                </b>
                              </div>
                              <div>
                                <span>Montant dû</span>
                                <b>{money(statement.amountDue)}</b>
                              </div>
                              <div>
                                <span>Lignes reconnues</span>
                                <b>{statement.rows.length}</b>
                              </div>
                            </div>
                            <details className="pdf-details">
                              <summary>Toutes les lignes de la fiche</summary>
                              <div className="statement-lines">
                                {statement.rows.map((row, index) => (
                                  <div key={`${row.key}-${row.date}-${index}`}>
                                    <b>{row.key}</b>
                                    <span>{row.date}</span>
                                    <span>Course {money(row.amount)}</span>
                                    <span>Pourboire {money(row.tip)}</span>
                                    <strong>
                                      {money(row.amount + row.tip)}
                                    </strong>
                                  </div>
                                ))}
                              </div>
                            </details>
                          </section>
                          <section className="bill-comparison">
                            <div className="bill-comparison-head">
                              <h4>Courses de cette fiche</h4>
                              <span>
                                <b>
                                  {
                                    comparisons.filter(
                                      (row) => row.status === "ok",
                                    ).length
                                  }
                                </b>{" "}
                                correctes ·{" "}
                                <b>
                                  {
                                    comparisons.filter(
                                      (row) => row.status !== "ok",
                                    ).length
                                  }
                                </b>{" "}
                                à vérifier
                              </span>
                            </div>
                            <div className="bill-course-list">
                              {comparisons.map((row, index) => (
                                <div
                                  className={`bill-course ${row.status}`}
                                  key={`${row.key}-${row.date}-${index}`}
                                >
                                  <span className="status-dot">
                                    {row.status === "ok" ? "✓" : "!"}
                                  </span>
                                  <div className="bill-course-main">
                                    <b>
                                      {row.type === "adapte"
                                        ? row.key
                                        : `Course Téo ${row.key}`}
                                    </b>
                                    <small>
                                      {new Date(
                                        row.date + "T12:00",
                                      ).toLocaleDateString("fr-CA")}{" "}
                                      ·{" "}
                                      {row.status === "ok"
                                        ? "Correspond"
                                        : row.status === "different"
                                          ? row.type === "adapte"
                                            ? "Date et HOB trouvés · montant différent"
                                            : "Montant ou pourboire différent"
                                          : row.status === "missing-app"
                                            ? "Absente de l’application"
                                            : "Absente de la fiche"}
                                    </small>
                                    <small>
                                      Application :{" "}
                                      {row.appAmount === null
                                        ? "—"
                                        : money(
                                            row.appAmount + (row.appTip || 0),
                                          )}{" "}
                                      · Téo : {money(row.amount + row.tip)}
                                      {row.type === "taxi" &&
                                        ` · Pourboire ${money(row.tip)}`}
                                    </small>
                                    {row.status === "missing-app" && (
                                      <button
                                        type="button"
                                        className="correct-teo"
                                        onClick={() => savePayRow(row)}
                                      >
                                        Enregistrer dans l’application
                                      </button>
                                    )}
                                    {row.status === "different" &&
                                      row.courseId && (
                                        <button
                                          type="button"
                                          className="correct-teo"
                                          onClick={() => correctFromTeo(row)}
                                        >
                                          Corriger selon Téo
                                        </button>
                                      )}
                                    {row.status !== "ok" && row.courseId && (
                                      <div className="bill-course-actions">
                                        <select
                                          aria-label="Changer le mode de paiement"
                                          defaultValue=""
                                          onChange={(event) => {
                                            if (event.target.value)
                                              changeCoursePayment(
                                                row.courseId!,
                                                event.target.value,
                                              );
                                          }}
                                        >
                                          <option value="" disabled>
                                            Changer paiement
                                          </option>
                                          <option value="Téo / carte">
                                            Téo / carte
                                          </option>
                                          <option value="Espèces">
                                            Espèces
                                          </option>
                                          <option value="Machine crédit">
                                            Machine crédit
                                          </option>
                                        </select>
                                        <button
                                          type="button"
                                          className="check-delete"
                                          onClick={() =>
                                            deleteCheckedCourse(row.courseId!)
                                          }
                                        >
                                          Supprimer
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </section>
                        </>
                      )}
                    </div>
                  ))}
                </section>
              )}
              {false && payRows.length > 0 && (
                <>
                  <div className="comparison-title">
                    <span>Comparaison de la fiche</span>
                    <b>{selectedStatementId}</b>
                  </div>
                  <div className="check-summary">
                    <div>
                      <b>
                        {comparisons.filter((x) => x.status === "ok").length}
                      </b>
                      <span>Correspondent</span>
                    </div>
                    <div>
                      <b>
                        {comparisons.filter((x) => x.status !== "ok").length}
                      </b>
                      <span>À vérifier</span>
                    </div>
                  </div>
                  {comparisons.some((x) => x.status === "missing-app") && (
                    <div className="unregistered">
                      <div className="unregistered-head">
                        <h3>Courses non enregistrées</h3>
                        <span>
                          {
                            comparisons.filter(
                              (x) => x.status === "missing-app",
                            ).length
                          }
                        </span>
                      </div>
                      {comparisons
                        .filter((x) => x.status === "missing-app")
                        .map((row) => (
                          <div
                            className="unregistered-row"
                            key={`${row.key}-${row.date}`}
                          >
                            <div>
                              <b>
                                {row.type === "taxi"
                                  ? `Course Téo ${row.key}`
                                  : row.key}
                              </b>
                              <small>
                                {new Date(
                                  row.date + "T12:00",
                                ).toLocaleDateString("fr-CA")}{" "}
                                · Course {money(row.amount)}
                                {row.tip
                                  ? ` · Pourboire ${money(row.tip)}`
                                  : ""}
                              </small>
                            </div>
                            <button onClick={() => savePayRow(row)}>
                              Enregistrer
                            </button>
                          </div>
                        ))}
                    </div>
                  )}
                  {comparisons.some((x) => x.status === "missing-pay") && (
                    <div className="missing-pay-box">
                      <div className="unregistered-head">
                        <h3>Courses absentes de la fiche de paie</h3>
                        <span>
                          {
                            comparisons.filter(
                              (x) => x.status === "missing-pay",
                            ).length
                          }
                        </span>
                      </div>
                      <p>
                        Ces courses sont enregistrées dans l’application, mais
                        Téo ne les a pas inscrites sur cette fiche.
                      </p>
                      {comparisons
                        .filter((x) => x.status === "missing-pay")
                        .map((row, index) => (
                          <div
                            className="missing-pay-item"
                            key={`${row.courseId}-${index}`}
                          >
                            <div>
                              <b>
                                {row.type === "adapte"
                                  ? row.key
                                  : row.key === "Course carte"
                                    ? "Course Téo / carte"
                                    : `Course Téo ${row.key}`}
                              </b>
                              <small>
                                {new Date(
                                  row.date + "T12:00",
                                ).toLocaleDateString("fr-CA")}
                                {row.type === "taxi" && (
                                  <> · Pourboire {money(row.appTip || 0)}</>
                                )}
                              </small>
                            </div>
                            <div className="missing-pay-actions">
                              <strong>
                                {money(
                                  (row.appAmount || 0) + (row.appTip || 0),
                                )}
                              </strong>
                              {row.courseId && (
                                <>
                                  <select
                                    aria-label="Changer le mode de paiement"
                                    defaultValue=""
                                    onChange={(event) => {
                                      if (event.target.value)
                                        changeCoursePayment(
                                          row.courseId!,
                                          event.target.value,
                                        );
                                    }}
                                  >
                                    <option value="" disabled>
                                      Changer paiement
                                    </option>
                                    <option value="Téo / carte">
                                      Téo / carte
                                    </option>
                                    <option value="Espèces">Espèces</option>
                                    <option value="Machine crédit">
                                      Machine crédit
                                    </option>
                                  </select>
                                  <button
                                    type="button"
                                    className="check-delete"
                                    onClick={() =>
                                      deleteCheckedCourse(row.courseId!)
                                    }
                                  >
                                    Supprimer
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                  <div className="compare-list">
                    {comparisons.map((r, i) => (
                      <div
                        className={`compare-row ${r.status}`}
                        key={`${r.key}-${r.date}-${i}`}
                      >
                        <span className="status-dot">
                          {r.status === "ok" ? "✓" : "!"}
                        </span>
                        <div>
                          <b>
                            {r.type === "adapte"
                              ? r.key
                              : `Course Téo ${r.key}`}
                          </b>
                          <small>
                            {new Date(r.date + "T12:00").toLocaleDateString(
                              "fr-CA",
                            )}{" "}
                            ·{" "}
                            {r.status === "ok"
                              ? "Correspond"
                              : r.status === "different"
                                ? r.type === "adapte"
                                  ? "Date et HOB trouvés · montant différent"
                                  : "Montant ou pourboire différent"
                                : r.status === "missing-app"
                                  ? "Absente de l’application"
                                  : "Absente de la fiche"}
                          </small>
                          {r.status === "different" && r.courseId && (
                            <div className="check-actions">
                              <button
                                type="button"
                                className="correct-teo"
                                onClick={() => correctFromTeo(r)}
                              >
                                Corriger selon Téo
                              </button>
                              <select
                                aria-label="Changer le mode de paiement"
                                defaultValue=""
                                onChange={(event) => {
                                  if (event.target.value)
                                    changeCoursePayment(
                                      r.courseId!,
                                      event.target.value,
                                    );
                                }}
                              >
                                <option value="" disabled>
                                  Changer paiement
                                </option>
                                <option value="Téo / carte">Téo / carte</option>
                                <option value="Espèces">Espèces</option>
                                <option value="Machine crédit">
                                  Machine crédit
                                </option>
                              </select>
                              <button
                                type="button"
                                className="check-delete"
                                onClick={() => deleteCheckedCourse(r.courseId!)}
                              >
                                Supprimer
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="compare-money">
                          <b>
                            {r.appAmount !== null
                              ? money(r.appAmount + (r.appTip || 0))
                              : "—"}
                          </b>
                          <small>
                            App · Paie {money(r.amount + r.tip)}
                            {r.type === "taxi" && (
                              <> · Pourboire {money(r.tip)}</>
                            )}
                          </small>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="form-card settings-card">
              <div className="form-title">
                <div>
                  <h2>Réglages</h2>
                  <p>Taux utilisés automatiquement dans les calculs.</p>
                </div>
                <span className="type-icon">⚙</span>
              </div>
              <div className="account-settings">
                <div><b>{user.displayName || "Compte chauffeur"}</b><small>{user.email}</small></div>
                <button type="button" onClick={() => signOut(auth)}>Se déconnecter</button>
              </div>
              <div className="service-options">
                <label>
                  <span>
                    <b>Objectif quotidien</b>
                    <small>Afficher la progression dans le cadre coloré</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.dailyGoalEnabled}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        dailyGoalEnabled: e.target.checked,
                      })
                    }
                  />
                </label>
                <label>
                  <span>
                    <b>Courses Aéroport</b>
                    <small>Afficher le choix Aéroport dans Ajouter</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.airportEnabled}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        airportEnabled: e.target.checked,
                      })
                    }
                  />
                </label>
                <label>
                  <span>
                    <b>Transport adapté</b>
                    <small>Afficher le formulaire adapté dans Ajouter</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.adaptedEnabled}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        adaptedEnabled: e.target.checked,
                      })
                    }
                  />
                </label>
              </div>
              {settings.dailyGoalEnabled && (
                <div className="goal-settings">
                  <b>Montant de l’objectif</b>
                  <div className="goal-mode">
                    <label>
                      <input
                        type="radio"
                        name="goal-mode"
                        checked={settings.dailyGoalMode === "same"}
                        onChange={() =>
                          setSettings({ ...settings, dailyGoalMode: "same" })
                        }
                      />
                      Même objectif toute la semaine
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="goal-mode"
                        checked={settings.dailyGoalMode === "custom"}
                        onChange={() =>
                          setSettings({ ...settings, dailyGoalMode: "custom" })
                        }
                      />
                      Personnaliser chaque jour
                    </label>
                  </div>
                  {settings.dailyGoalMode === "same" ? (
                    <label className="goal-amount">
                      Objectif par jour ($)
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={settings.dailyGoals[0]}
                        onChange={(e) => {
                          const amount = Number(e.target.value);
                          setSettings({
                            ...settings,
                            dailyGoals: Array(7).fill(amount),
                          });
                        }}
                      />
                    </label>
                  ) : (
                    <div className="daily-goal-grid">
                      {GOAL_DAYS.map((day, index) => (
                        <label key={day}>
                          {day}
                          <input
                            type="number"
                            step="1"
                            min="0"
                            value={settings.dailyGoals[index]}
                            onChange={(e) => {
                              const dailyGoals = [...settings.dailyGoals];
                              dailyGoals[index] = Number(e.target.value);
                              setSettings({ ...settings, dailyGoals });
                            }}
                          />
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="settings-grid">
                <label>
                  Frais Téo / carte (%)
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={settings.cardFee}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        cardFee: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Frais machine crédit (%)
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={settings.machineFee}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        machineFee: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Frais de compagnie par semaine ($)
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={settings.companyFee}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        companyFee: Number(e.target.value),
                      })
                    }
                  />
                </label>
                {settings.airportEnabled && (
                  <label>
                    Redevance par course aéroport ($)
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={settings.airportFee}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          airportFee: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                )}
                <label>
                  Taux transport adapté ($/h)
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={settings.adaptedRate}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        adaptedRate: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Minimum payé (heures)
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    value={settings.adaptedMinimum}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        adaptedMinimum: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Frais Téo adapté (%)
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={settings.adaptedFee}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        adaptedFee: Number(e.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <p className="settings-saved">
                ✓ Les changements sont enregistrés automatiquement.
              </p>
              <button
                type="button"
                className="cancel-edit"
                onClick={() => setSettings(DEFAULT_SETTINGS)}
              >
                Rétablir les taux d’origine
              </button>
              <div className="setting-row">
                <div>
                  <b>Début de semaine</b>
                  <span>Mardi au lundi</span>
                </div>
                <strong>Mardi</strong>
              </div>
              <div className="setting-row">
                <div>
                  <b>Frais de compagnie</b>
                  <span>Déduit une fois au début de chaque semaine</span>
                </div>
                <strong>Chaque mardi</strong>
              </div>
              {settings.airportEnabled && (
                <div className="setting-row">
                  <div>
                    <b>Période redevance aéroport</b>
                    <span>Facture envoyée chaque lundi</span>
                  </div>
                  <strong>Lundi au dimanche</strong>
                </div>
              )}
            </div>
          )}
        </section>
        {tab !== "settings" && (
          <section className="daily-courses">
            <div className="section-head">
              <div>
                <h2>Courses de la journée</h2>
                <p>
                  {new Date(selectedDate + "T12:00").toLocaleDateString(
                    "fr-CA",
                    { weekday: "long", day: "numeric", month: "long" },
                  )}
                </p>
              </div>
              <b className="daily-count">{selectedDayCourses.length}</b>
            </div>
            <div className="history-summary">
              <div>
                <span>Brut</span>
                <b>{money(selectedDayTotals.gross)}</b>
              </div>
              <div>
                <span>Pourboires</span>
                <b>{money(selectedDayTotals.tips)}</b>
              </div>
              <div>
                <span>Frais</span>
                <b>− {money(selectedDayTotals.fees)}</b>
              </div>
              {selectedDayAirportFeeTotal > 0 && (
                <div>
                  <span>Redevance aéroport</span>
                  <b>− {money(selectedDayAirportFeeTotal)}</b>
                </div>
              )}
              {selectedDayCompanyFee > 0 && (
                <div>
                  <span>Frais de compagnie</span>
                  <b>− {money(selectedDayCompanyFee)}</b>
                </div>
              )}
              <div>
                <span>Net</span>
                <b>{money(dailyNet)}</b>
              </div>
            </div>
            {selectedDayCourses.length === 0 ? (
              <p className="daily-empty">
                Aucune course enregistrée pour cette date.
              </p>
            ) : (
              selectedDayCourses.map((c) => {
                const fee = serviceFee(c, settings),
                  deductions = fee + (c.perception || 0),
                  payment = isCardPayment(c.payment)
                    ? "Téo / carte"
                    : c.payment;
                return (
                  <div className="daily-row" key={c.id}>
                    <span className={`course-icon ${c.type}`}>
                      {c.type === "taxi" ? "T" : "⏱"}
                    </span>
                    <div className="daily-info">
                      <b>
                        {c.type === "taxi"
                          ? c.taxiCategory === "aeroport"
                            ? "Course aéroport"
                            : "Course centre-ville"
                          : c.hob || "Transport adapté"}
                      </b>
                      <small>
                        {c.type === "taxi"
                          ? `${payment}${c.taxiCategory === "aeroport" ? " · Aéroport" : ""}`
                          : "Transport adapté"}
                      </small>
                      <div className="daily-details">
                        <span>
                          <em>Course brute</em>
                          <b>{money(c.amount)}</b>
                        </span>
                        {c.type === "taxi" ? (
                          <span>
                            <em>Pourboire</em>
                            <b>{money(c.tip)}</b>
                          </span>
                        ) : (
                          <>
                            <span>
                              <em>Heures réelles</em>
                              <b>{c.duration?.toFixed(2)} h</b>
                            </span>
                            <span>
                              <em>Heures payées</em>
                              <b>
                                {(
                                  c.billedDuration ||
                                  Math.max(
                                    c.duration || 0,
                                    settings.adaptedMinimum,
                                  )
                                ).toFixed(2)}{" "}
                                h
                              </b>
                            </span>
                          </>
                        )}
                        <span>
                          <em>Frais Téo</em>
                          <b>− {money(fee)}</b>
                        </span>
                        {Boolean(c.perception) && (
                          <span>
                            <em>Perception STM</em>
                            <b>− {money(c.perception || 0)}</b>
                          </span>
                        )}
                        <span className="net-detail">
                          <em>Net</em>
                          <b>{money(c.amount + c.tip - deductions)}</b>
                        </span>
                      </div>
                    </div>
                    <div className="course-actions">
                      <button
                        aria-label="Modifier"
                        className="edit"
                        onClick={() => editCourse(c)}
                      >
                        ✎
                      </button>
                      <button
                        aria-label="Supprimer"
                        className="delete"
                        onClick={() =>
                          setCourses(courses.filter((x) => x.id !== c.id))
                        }
                      >
                        ×
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </section>
        )}
        <section className="history" id="history">
          <div className="section-head">
            <div>
              <h2>Historique</h2>
              <p>
                {filteredHistory.length} course
                {filteredHistory.length !== 1 ? "s" : ""} affichée
                {filteredHistory.length !== 1 ? "s" : ""}
              </p>
            </div>
            {courses.length > 0 && (
              <button
                className="text-button"
                onClick={() => {
                  if (confirm("Effacer tout l’historique ?")) setCourses([]);
                }}
              >
                Tout effacer
              </button>
            )}
          </div>
          {courses.length > 0 && (
            <>
              <div className="history-controls">
                <input
                  aria-label="Rechercher un numéro HOB"
                  placeholder="Rechercher HOB…"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                />
                <select
                  aria-label="Filtrer par type"
                  value={historyType}
                  onChange={(e) =>
                    setHistoryType(e.target.value as typeof historyType)
                  }
                >
                  <option value="all">Toutes</option>
                  <option value="taxi">Taxi</option>
                  <option value="adapte">Adapté</option>
                </select>
                <select
                  aria-label="Filtrer par période"
                  value={historyPeriod}
                  onChange={(e) =>
                    setHistoryPeriod(e.target.value as typeof historyPeriod)
                  }
                >
                  <option value="week">Cette semaine</option>
                  <option value="last-week">Semaine passée</option>
                  <option value="month">Ce mois-ci</option>
                  <option value="last-month">Mois passé</option>
                  <option value="custom">Période personnalisée</option>
                  <option value="all">Tout l’historique</option>
                </select>
              </div>
              {historyPeriod === "custom" && (
                <div className="custom-period">
                  <label>
                    Du
                    <input
                      type="date"
                      value={customStart}
                      max={customEnd}
                      onChange={(e) => setCustomStart(e.target.value)}
                    />
                  </label>
                  <label>
                    Au
                    <input
                      type="date"
                      value={customEnd}
                      min={customStart}
                      onChange={(e) => setCustomEnd(e.target.value)}
                    />
                  </label>
                </div>
              )}
              <div className="history-summary">
                <div>
                  <span>Brut</span>
                  <b>{money(historyTotals.gross)}</b>
                </div>
                <div>
                  <span>Pourboires</span>
                  <b>{money(historyTotals.tips)}</b>
                </div>
                <div>
                  <span>Frais</span>
                  <b>− {money(historyTotals.fees)}</b>
                </div>
                {historyAirportFeeTotal > 0 && (
                  <div>
                    <span>Redevance aéroport</span>
                    <b>− {money(historyAirportFeeTotal)}</b>
                  </div>
                )}
                {historyCompanyFeeTotal > 0 && (
                  <div>
                    <span>Frais de compagnie</span>
                    <b>− {money(historyCompanyFeeTotal)}</b>
                  </div>
                )}
                <div>
                  <span>Net</span>
                  <b>
                    {money(
                      historyTotals.gross -
                        historyTotals.fees -
                        historyAirportFeeTotal -
                        historyCompanyFeeTotal,
                    )}
                  </b>
                </div>
              </div>
              <div
                className={`verification-count ${
                  unverifiedHistoryCount === 0 ? "complete" : "pending"
                }`}
              >
                <span>{unverifiedHistoryCount === 0 ? "✓" : "!"}</span>
                <div>
                  <b>{unverifiedHistoryCount}</b>
                  <small>
                    course{unverifiedHistoryCount !== 1 ? "s" : ""} non vérifiée
                    {unverifiedHistoryCount !== 1 ? "s" : ""} dans cette période
                  </small>
                </div>
              </div>
            </>
          )}
          {courses.length === 0 ? (
            <div className="empty">
              <span>↗</span>
              <h3>Aucune course</h3>
              <p>Votre première course apparaîtra ici.</p>
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="empty compact">
              <span>⌕</span>
              <h3>Aucune course trouvée</h3>
              <p>Modifiez la recherche ou les filtres.</p>
            </div>
          ) : (
            filteredHistory.map((c, index) => {
              const fee = serviceFee(c, settings),
                deductions = fee + (c.perception || 0),
                payment = isCardPayment(c.payment)
                  ? "Téo / carte"
                  : c.payment === "Autre"
                    ? "Machine crédit"
                    : c.payment;
              const showDate =
                index === 0 || filteredHistory[index - 1].date !== c.date;
              return (
                <div key={c.id}>
                  {showDate && (
                    <h3 className="history-date">
                      {new Date(c.date + "T12:00").toLocaleDateString("fr-CA", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                      })}
                    </h3>
                  )}
                  <article className="course">
                    <div className={`course-icon ${c.type}`}>
                      {c.type === "taxi" ? "T" : "⏱"}
                    </div>
                    <div className="course-info">
                      <b>
                        {c.type === "taxi"
                          ? c.taxiCategory === "aeroport"
                            ? "Course aéroport"
                            : "Course centre-ville"
                          : c.hob || "Transport adapté"}
                      </b>
                      <span>
                        {new Date(c.date + "T12:00").toLocaleDateString(
                          "fr-CA",
                          {
                            day: "numeric",
                            month: "short",
                          },
                        )}{" "}
                        ·{" "}
                        {c.type === "taxi"
                          ? `${payment}${c.taxiCategory === "aeroport" ? " · Aéroport" : ""}`
                          : `${c.duration?.toFixed(2)} h réelles · ${(c.billedDuration || Math.max(c.duration || 0, settings.adaptedMinimum)).toFixed(2)} h payées${c.perception ? ` · STM ${money(c.perception)}` : ""}`}
                      </span>
                      {c.verified && (
                        <span className="verified-course">
                          ✓ Vérifiée
                          {c.type === "taxi" && c.teoId
                            ? ` · ID ${c.teoId}`
                            : c.hob
                              ? ` · ID ${c.hob}`
                              : ""}
                          {c.verifiedBillId ? ` · ${c.verifiedBillId}` : ""}
                        </span>
                      )}
                    </div>
                    <div className="course-money">
                      <b>{money(c.amount + c.tip - deductions)}</b>
                      <span>
                        Brut {money(c.amount + c.tip)}
                        {c.tip > 0 ? ` · tip ${money(c.tip)}` : ""}
                        {deductions > 0 ? ` · frais ${money(deductions)}` : ""}
                      </span>
                    </div>
                    <div className="course-actions">
                      <button
                        aria-label="Modifier"
                        className="edit"
                        onClick={() => editCourse(c)}
                      >
                        ✎
                      </button>
                      <button
                        aria-label="Supprimer"
                        className="delete"
                        onClick={() =>
                          setCourses(courses.filter((x) => x.id !== c.id))
                        }
                      >
                        ×
                      </button>
                    </div>
                  </article>
                </div>
              );
            })
          )}
        </section>
      </div>
      {notice && <div className="toast">{notice}</div>}
      <nav className="mobile-nav">
        <button
          className={mobilePage === "add" ? "selected" : ""}
          onClick={() => {
            setMobilePage("add");
            if (tab === "settings" || tab === "paie") setTab("taxi");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        >
          ＋<span>Ajouter</span>
        </button>
        <button
          className={mobilePage === "history" ? "selected" : ""}
          onClick={() => {
            setMobilePage("history");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        >
          ▤<span>Historique</span>
        </button>
        <button
          className={mobilePage === "pay" ? "selected" : ""}
          onClick={() => {
            setMobilePage("pay");
            setEditingId(null);
            setTab("paie");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        >
          ✓<span>Vérifier paie</span>
        </button>
        <button
          className={mobilePage === "settings" ? "selected" : ""}
          onClick={() => {
            setMobilePage("settings");
            setEditingId(null);
            setTab("settings");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        >
          ⚙<span>Réglages</span>
        </button>
      </nav>
    </main>
  );
}
