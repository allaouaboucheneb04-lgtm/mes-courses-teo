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
import { getPayrollCourseDates } from "@/lib/payroll-dates";
import {
  extractCouponPayrollRows,
  normalizeCouponReference,
} from "@/lib/coupon-payroll";
type CouponStatus = "deposited" | "pending" | "fuel";
type HistoryPaymentFilter =
  | "all"
  | "teo-card"
  | "cash"
  | "coupon"
  | "machine"
  | "adapted";
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
  couponStatus?: CouponStatus;
  couponNumber?: string;
  couponAccount?: string;
  verified?: boolean;
  verifiedBillId?: string;
  verifiedAt?: string;
};
type TaxiExpense = {
  id: string;
  date: string;
  category:
    | "Essence"
    | "Lavage"
    | "Entretien et réparation"
    | "Assurance"
    | "Location ou financement"
    | "Stationnement"
    | "Permis et immatriculation"
    | "Repas"
    | "Autre";
  amount: number;
  payment: "Carte" | "Espèces" | "Compte bancaire";
  note?: string;
};
type PayRow = {
  key: string;
  type: "taxi" | "adapte";
  date: string;
  amount: number;
  tip: number;
  paymentKind?: "card" | "coupon";
  couponNumber?: string;
  couponAccount?: string;
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
type PhotoCourse = {
  id: string;
  date: string;
  total: string;
  tip: string;
  category: "centre-ville" | "aeroport";
  selected: boolean;
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
const COUPON_STATUS_LABELS: Record<CouponStatus, string> = {
  deposited: "Déposé dans l’app Téo",
  pending: "Non déposé",
  fuel: "Utilisé pour l’essence",
};
const EXPENSE_CATEGORIES: TaxiExpense["category"][] = [
  "Essence",
  "Lavage",
  "Entretien et réparation",
  "Assurance",
  "Location ou financement",
  "Stationnement",
  "Permis et immatriculation",
  "Repas",
  "Autre",
];
const EXPENSE_ICONS: Record<TaxiExpense["category"], string> = {
  Essence: "⛽",
  Lavage: "🧽",
  "Entretien et réparation": "🔧",
  Assurance: "🛡️",
  "Location ou financement": "🚘",
  Stationnement: "🅿️",
  "Permis et immatriculation": "📄",
  Repas: "🍽️",
  Autre: "🧾",
};
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
const courseEmoji = (course: Course) => {
  if (course.type === "adapte") return "♿";
  if (isCardPayment(course.payment)) return "💳";
  if (course.payment === "Espèces" || course.payment === "Comptant")
    return "💵";
  if (course.payment === "Coupon") return "🎟️";
  if (course.payment === "Machine crédit" || course.payment === "Autre")
    return "🧾";
  return "🚕";
};
const couponStatusOf = (course: Course): CouponStatus =>
  course.couponStatus === "deposited" || course.couponStatus === "fuel"
    ? course.couponStatus
    : "pending";
const normalizeHob = (value?: string) =>
  (value || "").trim().toUpperCase().replace(/\s+/g, "");
const isCouponPayRow = (row: PayRow) =>
  row.type === "taxi" && row.paymentKind === "coupon";
const isDepositedCoupon = (course: Course) =>
  course.type === "taxi" &&
  course.payment === "Coupon" &&
  couponStatusOf(course) === "deposited";
const isPayrollCourse = (course: Course) =>
  course.type === "adapte" ||
  isCardPayment(course.payment) ||
  isDepositedCoupon(course);
const payRowTitle = (row: PayRow) => {
  if (row.type === "adapte") return row.key;
  if (isCouponPayRow(row))
    return `Coupon ${row.couponNumber || row.key || "sans numéro"}`;
  return row.key === "Course carte"
    ? "Course Téo / carte"
    : `Course Téo ${row.key}`;
};
const payrollCourseMatchesRow = (course: Course, row: PayRow) => {
  if (course.type !== row.type || course.date !== row.date) return false;
  if (row.type === "adapte")
    return normalizeHob(row.key) === normalizeHob(course.hob);
  if (isCouponPayRow(row)) {
    if (!isDepositedCoupon(course)) return false;
    const rowCoupon = normalizeCouponReference(row.couponNumber || row.key);
    const rowAccount = normalizeCouponReference(row.couponAccount);
    const courseCoupon = normalizeCouponReference(course.couponNumber);
    const courseAccount = normalizeCouponReference(course.couponAccount);
    if (!rowCoupon && !rowAccount) return false;
    return (
      (!rowCoupon || rowCoupon === courseCoupon) &&
      (!rowAccount || rowAccount === courseAccount)
    );
  }
  return (
    isCardPayment(course.payment) &&
    (!course.teoId || course.teoId === row.key)
  );
};
const payrollDifference = (course: Course, row: PayRow) => {
  if (row.type === "adapte") return Math.abs(course.amount - row.amount);
  if (isCouponPayRow(row))
    return Math.abs(course.amount + course.tip - (row.amount + row.tip));
  return (
    Math.abs(course.amount - row.amount) + Math.abs(course.tip - row.tip)
  );
};
const matchesHistoryPayment = (
  course: Course,
  filter: HistoryPaymentFilter,
) => {
  if (filter === "all") return true;
  if (filter === "adapted") return course.type === "adapte";
  if (course.type !== "taxi") return false;
  if (filter === "teo-card") return isCardPayment(course.payment);
  if (filter === "cash")
    return course.payment === "Espèces" || course.payment === "Comptant";
  if (filter === "coupon") return course.payment === "Coupon";
  return course.payment === "Machine crédit" || course.payment === "Autre";
};
const round2 = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;
const serviceFee = (course: Course, settings: AppSettings) => {
  const gross = course.amount + course.tip;
  if (course.type === "adapte")
    return round2((course.amount * settings.adaptedFee) / 100);
  let fee = 0;
  if (isCardPayment(course.payment) || course.payment === "Coupon")
    fee = (gross * settings.cardFee) / 100;
  else if (course.payment === "Machine crédit" || course.payment === "Autre")
    fee = (gross * settings.machineFee) / 100;
  return round2(fee);
};
const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const tuesdayWeekForDate = (value: string) => {
  const selected = new Date(`${value}T12:00:00`),
    start = new Date(
      selected.getFullYear(),
      selected.getMonth(),
      selected.getDate(),
    );
  start.setDate(start.getDate() - ((start.getDay() - 2 + 7) % 7));
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start: dateKey(start), end: dateKey(end) };
};
const currentTuesdayWeek = () => tuesdayWeekForDate(today());
const mondayWeekForDate = (value: string) => {
  const selected = new Date(`${value}T12:00:00`),
    start = new Date(
      selected.getFullYear(),
      selected.getMonth(),
      selected.getDate(),
    );
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
    [expenses, setExpenses] = useState<TaxiExpense[]>([]),
    [loaded, setLoaded] = useState(false),
    [notice, setNotice] = useState("");
  const [payRows, setPayRows] = useState<PayRow[]>([]),
    [payFile, setPayFile] = useState(""),
    [payLoading, setPayLoading] = useState(false),
    [payError, setPayError] = useState(""),
    [payStatements, setPayStatements] = useState<PayStatement[]>([]),
    [selectedStatementId, setSelectedStatementId] = useState("");
  const [billSearch, setBillSearch] = useState(""),
    [billStatus, setBillStatus] = useState<"all" | "issues" | "clear">(
      "all",
    ),
    [billPeriod, setBillPeriod] = useState<
      "all" | "last-week" | "month" | "custom"
    >("all"),
    [billCustomStart, setBillCustomStart] = useState(
      currentTuesdayWeek().start,
    ),
    [billCustomEnd, setBillCustomEnd] = useState(today());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [mobilePage, setMobilePage] = useState<
    "add" | "history" | "expenses" | "pay" | "settings"
  >("add");
  const [expenseEditingId, setExpenseEditingId] = useState<string | null>(null);
  const [expensePeriod, setExpensePeriod] = useState<"week" | "month" | "all">("week");
  const [expenseForm, setExpenseForm] = useState({
    date: today(),
    category: "Essence" as TaxiExpense["category"],
    amount: "",
    payment: "Carte" as TaxiExpense["payment"],
    note: "",
  });
  const [taxi, setTaxi] = useState({
    date: today(),
    amount: "",
    tip: "",
    payment: "Téo / carte",
    couponStatus: "pending" as CouponStatus,
    couponNumber: "",
    couponAccount: "",
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
    [historyPayment, setHistoryPayment] =
      useState<HistoryPaymentFilter>("all"),
    [customStart, setCustomStart] = useState(currentTuesdayWeek().start),
    [customEnd, setCustomEnd] = useState(today());
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "" });
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [syncState, setSyncState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [photoCourses, setPhotoCourses] = useState<PhotoCourse[]>([]);
  const [photoReading, setPhotoReading] = useState(false);
  const [photoProgress, setPhotoProgress] = useState(0);
  const [photoMessage, setPhotoMessage] = useState("");
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
          setExpenses(Array.isArray(remote.expenses) ? remote.expenses : []);
          setSettings({ ...DEFAULT_SETTINGS, ...(remote.settings || {}) });
          setPayStatements(Array.isArray(remote.payStatements) ? remote.payStatements : []);
        } else {
          const localCourses = JSON.parse(localStorage.getItem("teo-courses") || "[]") as Course[];
          const localSettings = JSON.parse(localStorage.getItem("teo-settings") || "{}") as Partial<AppSettings>;
          const localStatements = JSON.parse(localStorage.getItem("teo-pay-statements") || "[]") as PayStatement[];
          const migratedSettings = { ...DEFAULT_SETTINGS, ...localSettings };
          setCourses(localCourses); setSettings(migratedSettings); setPayStatements(localStatements);
          await setDoc(stateRef, { courses: localCourses, expenses: [], settings: migratedSettings, payStatements: localStatements, ownerEmail: user.email || "", updatedAt: serverTimestamp() });
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
        await setDoc(doc(db, "drivers", user.uid, "data", "app"), { courses, expenses, settings, payStatements, ownerEmail: user.email || "", updatedAt: serverTimestamp() }, { merge: true });
        setSyncState("saved");
      } catch (error) { console.error(error); setSyncState("error"); }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [courses, expenses, settings, payStatements, loaded, user]);
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
              payrollCourseMatchesRow(course, item) &&
              payrollDifference(course, item) < 0.02,
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
          payrollCourseMatchesRow(course, matchedRow)
        )
          return course;
        changed = true;
        return {
          ...course,
          ...(course.type === "taxi" && !isCouponPayRow(matchedRow)
            ? { teoId: matchedRow.key }
            : {}),
          ...(isCouponPayRow(matchedRow)
            ? {
                couponNumber:
                  matchedRow.couponNumber || course.couponNumber || "",
                couponAccount:
                  matchedRow.couponAccount || course.couponAccount || "",
              }
            : {}),
          verified: true,
          verifiedBillId: matchedStatement.id,
          verifiedAt: course.verifiedAt || matchedStatement.importedAt,
        };
      });
      return changed ? updated : current;
    });
  }, [loaded, payStatements]);
  const selectedDate =
    (mobilePage === "expenses"
      ? expenseForm.date
      : tab === "adapte"
        ? adapted.date
        : taxi.date) || today();
  const week = tuesdayWeekForDate(selectedDate);
  const weeklyCourses = useMemo(
    () => courses.filter((c) => c.date >= week.start && c.date <= week.end),
    [courses, week.start, week.end],
  );
  const airportWeek = mondayWeekForDate(selectedDate);
  const weeklyAirportCourses = useMemo(
    () =>
      courses.filter(
        (course) =>
          course.type === "taxi" &&
          course.taxiCategory === "aeroport" &&
          course.date >= airportWeek.start &&
          course.date <= airportWeek.end,
      ),
    [courses, airportWeek.start, airportWeek.end],
  );
  const airportFeeTotal = round2(
    weeklyAirportCourses.length * settings.airportFee,
  );
  const weeklyCompanyFee = round2(settings.companyFee);
  const weeklyExpenses = useMemo(
    () => expenses.filter((expense) => expense.date >= week.start && expense.date <= week.end),
    [expenses, week.start, week.end],
  );
  const weeklyExpenseTotal = round2(
    weeklyExpenses.reduce((sum, expense) => sum + expense.amount, 0),
  );
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
          matchesHistoryPayment(c, historyPayment) &&
          (!query ||
            c.hob?.toUpperCase().includes(query) ||
            c.teoId?.toUpperCase().includes(query) ||
            c.couponNumber?.toUpperCase().includes(query) ||
            c.couponAccount?.toUpperCase().includes(query) ||
            c.payment.toUpperCase().includes(query) ||
            c.taxiCategory?.toUpperCase().includes(query)),
      )
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [
    courses,
    historyPeriod,
    historyType,
    historyPayment,
    historySearch,
    week,
    customStart,
    customEnd,
  ]);
  const historyGroups = useMemo(() => {
    const groups: Array<{ date: string; courses: Course[] }> = [];

    for (const course of filteredHistory) {
      const currentGroup = groups[groups.length - 1];
      if (!currentGroup || currentGroup.date !== course.date) {
        groups.push({ date: course.date, courses: [course] });
      } else {
        currentGroup.courses.push(course);
      }
    }

    return groups;
  }, [filteredHistory]);
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
  const historyCouponSummary = useMemo(() => {
    const summary: Record<
      CouponStatus,
      { count: number; amount: number }
    > = {
      deposited: { count: 0, amount: 0 },
      pending: { count: 0, amount: 0 },
      fuel: { count: 0, amount: 0 },
    };

    for (const course of filteredHistory) {
      if (course.type !== "taxi" || course.payment !== "Coupon") continue;
      const status = couponStatusOf(course);
      summary[status].count += 1;
      summary[status].amount += course.amount + course.tip;
    }

    return summary;
  }, [filteredHistory]);
  const historyCouponCount =
    historyCouponSummary.deposited.count +
    historyCouponSummary.pending.count +
    historyCouponSummary.fuel.count;
  const historyCouponAmount =
    historyCouponSummary.deposited.amount +
    historyCouponSummary.pending.amount +
    historyCouponSummary.fuel.amount;
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
        (course) => !course.verified && isPayrollCourse(course),
      ).length,
    [filteredHistory],
  );
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
  const dailyGoalNet = round2(
    selectedDayTotals.gross -
      selectedDayTotals.fees -
      selectedDayAirportFeeTotal,
  );
  const dailyNet = round2(dailyGoalNet - selectedDayCompanyFee);
  const dailyGoalProgress = dailyGoal
    ? Math.min(100, Math.max(0, (dailyGoalNet / dailyGoal) * 100))
    : 0;
  const filteredExpenses = useMemo(() => {
    if (expensePeriod === "all") return [...expenses].sort((a, b) => b.date.localeCompare(a.date));
    if (expensePeriod === "week")
      return expenses
        .filter((expense) => expense.date >= week.start && expense.date <= week.end)
        .sort((a, b) => b.date.localeCompare(a.date));
    const selected = new Date(`${expenseForm.date || today()}T12:00:00`);
    const month = `${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, "0")}`;
    return expenses
      .filter((expense) => expense.date.startsWith(month))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [expenses, expensePeriod, week.start, week.end, expenseForm.date]);
  const filteredExpenseTotal = round2(
    filteredExpenses.reduce((sum, expense) => sum + expense.amount, 0),
  );
  const comparisons = useMemo(() => {
    const used = new Set<string>();
    const payDates = new Set(getPayrollCourseDates(payRows));
    const rows: Array<
      PayRow & {
        status: "missing-app" | "ok" | "different" | "missing-pay";
        appAmount: number | null;
        appTip: number | null;
        courseId: string | null;
      }
    > = payRows.map((row) => {
      const candidates = courses.filter(
        (c) => !used.has(c.id) && payrollCourseMatchesRow(c, row),
      );
      const difference = (c: Course) => payrollDifference(c, row);
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
        !payDates.has(c.date) ||
        used.has(c.id) ||
        !isPayrollCourse(c)
      )
        continue;
      const coupon = isDepositedCoupon(c);
      rows.push({
        key:
          c.type === "adapte"
            ? c.hob || "Sans HOB"
            : coupon
              ? c.couponNumber || "Coupon sans numéro"
              : c.teoId || "Course carte",
        type: c.type,
        date: c.date,
        amount: 0,
        tip: 0,
        ...(coupon
          ? {
              paymentKind: "coupon" as const,
              couponNumber: c.couponNumber || "",
              couponAccount: c.couponAccount || "",
            }
          : c.type === "taxi"
            ? { paymentKind: "card" as const }
            : {}),
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
      const dates = new Set(getPayrollCourseDates(statement.rows));
      if (!dates.size) {
        warnings[statement.id] = 0;
        continue;
      }
      const usedRows = new Set<number>();
      let missing = 0;
      for (const course of courses.filter(
        (item) => dates.has(item.date) && isPayrollCourse(item),
      )) {
        const candidate = statement.rows
          .map((row, index) => ({ row, index }))
          .filter(
            ({ row, index }) =>
              !usedRows.has(index) &&
              payrollCourseMatchesRow(course, row),
          )
          .sort(
            (a, b) =>
              payrollDifference(course, a.row) -
              payrollDifference(course, b.row),
          )[0];
        if (candidate) {
          usedRows.add(candidate.index);
          if (payrollDifference(course, candidate.row) >= 0.02) missing++;
        } else missing++;
      }
      missing += statement.rows.filter(
        (_row, index) => !usedRows.has(index),
      ).length;
      warnings[statement.id] = missing;
    }
    return warnings;
  }, [payStatements, courses]);
  const filteredPayStatements = useMemo(() => {
    const query = billSearch.trim().toLowerCase();
    let bounds: [string, string] | null = null;

    if (billPeriod === "last-week") {
      const previousStart = new Date(
        `${currentTuesdayWeek().start}T12:00:00`,
      );
      previousStart.setDate(previousStart.getDate() - 7);
      const previousEnd = new Date(previousStart);
      previousEnd.setDate(previousEnd.getDate() + 6);
      bounds = [dateKey(previousStart), dateKey(previousEnd)];
    } else if (billPeriod === "month") {
      const currentDate = new Date(`${today()}T12:00:00`);
      const monthStart = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        1,
      );
      const monthEnd = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() + 1,
        0,
      );
      bounds = [dateKey(monthStart), dateKey(monthEnd)];
    } else if (billPeriod === "custom") {
      bounds =
        billCustomStart <= billCustomEnd
          ? [billCustomStart, billCustomEnd]
          : [billCustomEnd, billCustomStart];
    }

    return payStatements.filter((statement) => {
      const courseDates = getPayrollCourseDates(statement.rows);
      const matchesSearch =
        !query ||
        statement.id.toLowerCase().includes(query) ||
        statement.fileName.toLowerCase().includes(query) ||
        statement.invoiceDate.includes(query) ||
        courseDates.some((date) => date.includes(query));
      const matchesPeriod =
        !bounds ||
        courseDates.some((date) => date >= bounds[0] && date <= bounds[1]);
      const hasIssues = (statementWarnings[statement.id] || 0) > 0;
      const matchesStatus =
        billStatus === "all" ||
        (billStatus === "issues" && hasIssues) ||
        (billStatus === "clear" && !hasIssues);

      return matchesSearch && matchesPeriod && matchesStatus;
    });
  }, [
    billCustomEnd,
    billCustomStart,
    billPeriod,
    billSearch,
    billStatus,
    payStatements,
    statementWarnings,
  ]);
  const selectedPayStatement =
    payStatements.find((statement) => statement.id === selectedStatementId) ||
    null;
  const comparisonIssues = selectedPayStatement
    ? comparisons.filter((row) => row.status !== "ok")
    : [];
  const comparisonMatches = selectedPayStatement
    ? comparisons.filter((row) => row.status === "ok")
    : [];
  function closeSelectedPayStatement() {
    setSelectedStatementId("");
    setPayRows([]);
    setPayFile("");
  }
  function togglePayStatement(statement: PayStatement) {
    if (statement.id === selectedStatementId) {
      closeSelectedPayStatement();
      return;
    }
    setSelectedStatementId(statement.id);
    setPayRows(statement.rows);
    setPayFile(statement.fileName);
    window.setTimeout(() => {
      document
        .getElementById("pay-statement-analysis")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }
  const flash = (t: string) => {
    setNotice(t);
    window.setTimeout(() => setNotice(""), 2400);
  };
  function resetExpenseForm(date = expenseForm.date || today()) {
    setExpenseEditingId(null);
    setExpenseForm({
      date,
      category: "Essence",
      amount: "",
      payment: "Carte",
      note: "",
    });
  }
  function saveExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = parseMoneyInput(expenseForm.amount);
    if (!expenseForm.date || amount <= 0) {
      flash("Inscrivez une date et un montant valide.");
      return;
    }
    const expense: TaxiExpense = {
      id: expenseEditingId || crypto.randomUUID(),
      date: expenseForm.date,
      category: expenseForm.category,
      amount,
      payment: expenseForm.payment,
      note: expenseForm.note.trim(),
    };
    setExpenses((current) =>
      expenseEditingId
        ? current.map((item) => (item.id === expenseEditingId ? expense : item))
        : [expense, ...current],
    );
    resetExpenseForm(expense.date);
    flash(expenseEditingId ? "Dépense modifiée." : "Dépense ajoutée.");
  }
  function editExpense(expense: TaxiExpense) {
    setExpenseEditingId(expense.id);
    setExpenseForm({
      date: expense.date,
      category: expense.category,
      amount: formatMoneyInput(expense.amount),
      payment: expense.payment,
      note: expense.note || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function deleteExpense(expenseId: string) {
    if (!window.confirm("Supprimer cette dépense?")) return;
    setExpenses((current) => current.filter((expense) => expense.id !== expenseId));
    if (expenseEditingId === expenseId) resetExpenseForm();
    flash("Dépense supprimée.");
  }
  function changeCoursePayment(courseId: string, payment: string) {
    setCourses((current) =>
      current.map((course) => {
        if (course.id !== courseId) return course;
        const updated: Course = { ...course, payment };
        if (payment === "Coupon") {
          updated.couponStatus = course.couponStatus || "pending";
        } else {
          delete updated.couponStatus;
          delete updated.couponNumber;
          delete updated.couponAccount;
        }
        return updated;
      }),
    );
    flash("Mode de paiement modifié.");
  }
  function correctFromTeo(row: (typeof comparisons)[number]) {
    if (!row.courseId || row.status !== "different") return;
    setCourses((current) =>
      current.map((course) => {
        if (course.id !== row.courseId) return course;
        const coupon = isCouponPayRow(row);
        return {
          ...course,
          amount: coupon
            ? round2(Math.max(0, row.amount + row.tip - course.tip))
            : row.amount,
          tip: coupon ? course.tip : row.tip,
          ...(row.type === "taxi" && !coupon ? { teoId: row.key } : {}),
          ...(coupon
            ? {
                couponNumber: row.couponNumber || course.couponNumber || "",
                couponAccount: row.couponAccount || course.couponAccount || "",
              }
            : {}),
          verified: true,
          verifiedBillId: selectedStatementId,
          verifiedAt: new Date().toISOString(),
        };
      }),
    );
    flash("Course corrigée selon la fiche Téo.");
  }
  function deleteCheckedCourse(courseId: string) {
    if (!window.confirm("Supprimer cette course de l’application?")) return;
    setCourses((current) => current.filter((course) => course.id !== courseId));
    flash("Course supprimée.");
  }
  function savePayRow(row: PayRow) {
    const coupon = isCouponPayRow(row);
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
      payment:
        row.type === "adapte"
          ? "Transport adapté"
          : coupon
            ? "Coupon"
            : "Téo / carte",
      ...(row.type === "taxi" && !coupon ? { teoId: row.key } : {}),
      ...(row.type === "taxi" ? { taxiCategory: "centre-ville" as const } : {}),
      ...(coupon
        ? {
            couponStatus: "deposited" as const,
            couponNumber: row.couponNumber || row.key,
            couponAccount: row.couponAccount || "",
          }
        : {}),
      ...(row.type === "adapte"
        ? {
            hob: row.key,
            duration: billedDuration,
            billedDuration,
          }
        : {}),
      perception: 0,
      verified: true,
      verifiedBillId: selectedStatementId,
      verifiedAt: new Date().toISOString(),
    };
    setCourses([course, ...courses]);
    flash(`${payRowTitle(row)} enregistré${row.type === "adapte" ? "e" : ""}.`);
  }
  function editCourse(course: Course) {
    setEditingId(course.id);
    setMobilePage("add");
    if (course.type === "taxi") {
      setTaxi({
        date: course.date,
        amount: formatMoneyInput(round2(course.amount + course.tip)),
        tip: formatMoneyInput(course.tip),
        payment: isCardPayment(course.payment) ? "Téo / carte" : course.payment,
        couponStatus: course.couponStatus || "pending",
        couponNumber: course.couponNumber || "",
        couponAccount: course.couponAccount || "",
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
      couponStatus: "pending",
      couponNumber: "",
      couponAccount: "",
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
      await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
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
          paymentKind: "card",
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
      for (const coupon of extractCouponPayrollRows(text))
        rows.push({
          key:
            coupon.couponNumber ||
            coupon.couponAccount ||
            `Coupon-${coupon.date}`,
          type: "taxi",
          date: coupon.date,
          amount: coupon.amount,
          tip: coupon.tip,
          paymentKind: "coupon",
          couponNumber: coupon.couponNumber,
          couponAccount: coupon.couponAccount,
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
      const dates = getPayrollCourseDates(rows);
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
        const linked = new Set<number>();
        return current.map((course) => {
          const matched = rows
            .map((item, index) => ({ item, index }))
            .find(
              ({ item, index }) =>
                !linked.has(index) &&
                payrollCourseMatchesRow(course, item) &&
                payrollDifference(course, item) < 0.02,
            );
          if (!matched) return course;
          const row = matched.item;
          linked.add(matched.index);
          return {
            ...course,
            ...(row.type === "taxi" && !isCouponPayRow(row)
              ? { teoId: row.key }
              : {}),
            ...(isCouponPayRow(row)
              ? {
                  couponNumber: row.couponNumber || course.couponNumber || "",
                  couponAccount: row.couponAccount || course.couponAccount || "",
                }
              : {}),
            verified: true,
            verifiedBillId: billId,
            verifiedAt: new Date().toISOString(),
          };
        });
      });
      flash(`Fiche ${billId} enregistrée avec tous ses détails.`);
      window.setTimeout(() => {
        document
          .getElementById("pay-statement-analysis")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    } catch (error) {
      console.error(error);
      const reason =
        error instanceof Error ? error.message : "Erreur de lecture inconnue";
      setPayError(`Impossible de lire cette fiche : ${reason}`);
    } finally {
      setPayLoading(false);
    }
  }
  function addTaxi(e: React.FormEvent) {
    e.preventDefault();
    const total = parseMoneyInput(taxi.amount);
    const tip = parseMoneyInput(taxi.tip);
    if (!total || total < 0)
      return flash("Entrez un montant total valide.");
    if (taxi.tip === "")
      return flash("Entrez le pourboire, même s’il est de 0,00 $.");
    if (tip > total)
      return flash("Le pourboire ne peut pas dépasser le montant total.");
    if (
      taxi.payment === "Coupon" &&
      !normalizeCouponReference(taxi.couponNumber)
    )
      return flash("Entrez le numéro du coupon.");
    if (
      taxi.payment === "Coupon" &&
      !normalizeCouponReference(taxi.couponAccount)
    )
      return flash("Entrez le numéro de compte du coupon.");
    const updated: Course = {
      id: editingId || crypto.randomUUID(),
      type: "taxi",
      date: taxi.date,
      amount: round2(total - tip),
      tip: round2(tip),
      payment: taxi.payment,
      ...(taxi.payment === "Coupon"
        ? {
            couponStatus: taxi.couponStatus,
            couponNumber: taxi.couponNumber.trim().toUpperCase(),
            couponAccount: taxi.couponAccount.trim().toUpperCase(),
          }
        : {}),
      taxiCategory: taxi.category,
    };
    setCourses(
      editingId
        ? courses.map((c) => (c.id === editingId ? updated : c))
        : [updated, ...courses],
    );
    const wasEditing = Boolean(editingId);
    setEditingId(null);
    setTaxi({
      ...taxi,
      amount: "",
      tip: "",
      couponNumber: "",
      couponAccount: "",
    });
    flash(wasEditing ? "Course taxi modifiée." : "Course taxi ajoutée.");
  }

  const parseTabletPhoto = (rawText: string) => {
    const text = rawText
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\r/g, "\n");
    // On reflective tablet photos, Tesseract commonly reads 45,60 $ as
    // "4560$" and 167,88 $ as "167885" (the final 5 is the $ sign).
    const amountPattern = /\b(\d{1,4}[,.]\d{2})\s*\$?|(?:^|\n)[^\d\n]{0,16}(\d{4,6})\s*\$?/gm;
    const matches = [...text.matchAll(amountPattern)].filter((match) => {
      const value = match[1] || match[2] || "";
      return !value.includes("/") && !/^20\d{2}$/.test(value);
    });
    const detected: PhotoCourse[] = [];
    matches.forEach((match, index) => {
      const start = match.index || 0;
      const end = matches[index + 1]?.index ?? text.length;
      const segment = text.slice(start, end).toUpperCase();
      // Never import a row that OCR positively identifies as cash. If glare
      // erased the word "Carte", keep the candidate so the driver can verify
      // it instead of silently losing a paid ride.
      if (/\bCOMPTANT\b/.test(segment)) return;
      const dateMatch = segment.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](20\d{2})\b/);
      if (!dateMatch) return;
      const [, day, month, year] = dateMatch;
      const date = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
      let recognizedAmount = match[1] || match[2] || "";
      let total: number;
      if (/[,.]/.test(recognizedAmount)) {
        total = Number(recognizedAmount.replace(",", "."));
      } else {
        // A six-digit compact value ending in 5 is usually "16788" + a
        // dollar sign misread as 5.
        if (recognizedAmount.length === 6 && recognizedAmount.endsWith("5"))
          recognizedAmount = recognizedAmount.slice(0, -1);
        total = Number(recognizedAmount) / 100;
      }
      if (!Number.isFinite(total) || total <= 0 || total > 1000) return;
      detected.push({
        id: `photo-${Date.now()}-${index}`,
        date,
        total: total.toFixed(2).replace(".", ","),
        tip: "",
        category: /AEROPORT|AIRPORT|\bYUL\b/.test(segment) ? "aeroport" : "centre-ville",
        selected: true,
      });
    });

    // Second, card-first pass. Some Android phones return OCR blocks in a
    // different order: the payment label is present, but falls outside the
    // amount segment above. Attach every visible "Carte" label to the closest
    // preceding amount and nearby date.
    for (const cardMatch of text.matchAll(/\bCARTE\b/gi)) {
      const cardIndex = cardMatch.index || 0;
      const preceding = matches
        .filter((match) => (match.index || 0) < cardIndex && cardIndex - (match.index || 0) < 260)
        .at(-1);
      if (!preceding) continue;
      const nearby = text.slice(Math.max(0, (preceding.index || 0) - 20), Math.min(text.length, cardIndex + 180));
      if (/\bCOMPTANT\b/i.test(nearby.slice(0, Math.max(0, cardIndex - (preceding.index || 0))))) continue;
      const dateMatch = nearby.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](20\d{2})\b/);
      if (!dateMatch) continue;
      let recognizedAmount = preceding[1] || preceding[2] || "";
      let total: number;
      if (/[,.]/.test(recognizedAmount)) total = Number(recognizedAmount.replace(",", "."));
      else {
        if (recognizedAmount.length === 6 && recognizedAmount.endsWith("5")) recognizedAmount = recognizedAmount.slice(0, -1);
        total = Number(recognizedAmount) / 100;
      }
      if (!Number.isFinite(total) || total <= 0 || total > 1000) continue;
      const [, day, month, year] = dateMatch;
      const date = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
      if (detected.some((item) => item.date === date && parseMoneyInput(item.total) === total)) continue;
      detected.push({
        id: `photo-card-${Date.now()}-${cardIndex}`,
        date,
        total: total.toFixed(2).replace(".", ","),
        tip: "",
        category: /AEROPORT|AIRPORT|\bYUL\b/i.test(nearby) ? "aeroport" : "centre-ville",
        selected: true,
      });
    }
    return detected;
  };

  const readTabletPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setPhotoReading(true);
    setPhotoProgress(0);
    setPhotoMessage("Lecture des photos…");
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("fra", undefined, {
        logger: (message) => {
          if (message.status === "recognizing text")
            setPhotoProgress(Math.round((message.progress || 0) * 100));
        },
      });
      const allDetected: PhotoCourse[] = [];
      for (let index = 0; index < files.length; index += 1) {
        setPhotoMessage(`Lecture de la photo ${index + 1} sur ${files.length}…`);
        const result = await worker.recognize(files[index]);
        allDetected.push(...parseTabletPhoto(result.data.text));
      }
      await worker.terminate();
      const unique = allDetected.filter((item, index, list) =>
        list.findIndex((other) => other.date === item.date && other.total === item.total) === index,
      );
      setPhotoCourses(unique);
      setPhotoMessage(
        unique.length
          ? `${unique.length} course${unique.length > 1 ? "s" : ""} par carte détectée${unique.length > 1 ? "s" : ""}. Ajoutez le pourboire de chaque course.`
          : "Aucune course par carte reconnue. Essayez une photo plus droite et sans reflet.",
      );
    } catch (error) {
      console.error(error);
      setPhotoMessage("La photo n’a pas pu être analysée. Essayez une image plus nette.");
    } finally {
      setPhotoReading(false);
      setPhotoProgress(0);
    }
  };

  const savePhotoCourses = () => {
    const selected = photoCourses.filter((item) => item.selected);
    if (!selected.length) { setPhotoMessage("Sélectionnez au moins une course."); return; }
    if (selected.some((item) => item.tip === "")) {
      setPhotoMessage("Insérez le pourboire de chaque course sélectionnée, même s’il est de 0,00 $. ");
      return;
    }
    if (
      selected.some(
        (item) =>
          parseMoneyInput(item.tip) > parseMoneyInput(item.total),
      )
    ) {
      setPhotoMessage(
        "Le pourboire ne peut pas dépasser le montant total de la course.",
      );
      return;
    }
    const existingOrAdded = [...courses];
    let added = 0;
    let duplicates = 0;
    selected.forEach((item, index) => {
      const total = parseMoneyInput(item.total);
      const tip = parseMoneyInput(item.tip);
      if (tip > total) return;
      const duplicate = existingOrAdded.some((course) =>
        course.type === "taxi" &&
        isCardPayment(course.payment) &&
        course.date === item.date &&
        Math.abs(course.amount + course.tip - total) < 0.02,
      );
      if (duplicate) { duplicates += 1; return; }
      existingOrAdded.unshift({
        id: `${Date.now()}-photo-${index}`,
        type: "taxi",
        date: item.date,
        amount: round2(total - tip),
        tip: round2(tip),
        payment: "Téo / carte",
        taxiCategory: settings.airportEnabled ? item.category : "centre-ville",
      });
      added += 1;
    });
    setCourses(existingOrAdded);
    setPhotoCourses([]);
    setPhotoMessage(`${added} course${added !== 1 ? "s" : ""} ajoutée${added !== 1 ? "s" : ""}${duplicates ? ` · ${duplicates} doublon${duplicates > 1 ? "s" : ""} ignoré${duplicates > 1 ? "s" : ""}` : ""}.`);
  };
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
  const renderPayComparison = (
    row: (typeof comparisons)[number],
    index: number,
    group: string,
  ) => {
    const appTotal =
      row.appAmount === null
        ? null
        : row.appAmount + (row.appTip || 0);
    const teoTotal =
      row.status === "missing-pay" ? null : row.amount + row.tip;
    const title = payRowTitle(row);
    const statusLabel =
      row.status === "ok"
        ? "Correspond"
        : row.status === "different"
          ? "Montant différent"
          : row.status === "missing-app"
            ? "À enregistrer"
            : "Absente du PDF";
    const statusText =
      row.status === "ok"
        ? "Les montants de l’application et de la fiche sont identiques."
        : row.status === "different"
          ? row.type === "adapte"
            ? "La date et le numéro HOB correspondent, mais le montant est différent."
            : isCouponPayRow(row)
              ? "La date, le coupon et le compte correspondent, mais le total est différent."
              : "Le montant de la course ou le pourboire est différent."
          : row.status === "missing-app"
            ? "Cette course apparaît sur la fiche Téo, mais pas dans l’application."
            : "Cette course est dans l’application, mais elle n’apparaît pas sur la fiche Téo.";

    return (
      <article
        className={`pay-course-card ${row.status}`}
        key={`${group}-${row.key}-${row.date}-${index}`}
      >
        <header className="pay-course-head">
          <span className="status-dot">{row.status === "ok" ? "✓" : "!"}</span>
          <div>
            <b>{title}</b>
            <small>
              {new Date(row.date + "T12:00").toLocaleDateString("fr-CA", {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}
            </small>
            {isCouponPayRow(row) && (
              <small>
                Compte {row.couponAccount || "non lu dans le PDF"}
              </small>
            )}
          </div>
          <em>{statusLabel}</em>
        </header>
        <p className="pay-course-status">{statusText}</p>
        <div className="pay-course-amounts">
          <div>
            <span>Total application</span>
            <b>{appTotal === null ? "—" : money(appTotal)}</b>
          </div>
          <div>
            <span>Total fiche Téo</span>
            <b>{teoTotal === null ? "—" : money(teoTotal)}</b>
          </div>
          {row.type === "taxi" && !isCouponPayRow(row) && (
            <>
              <div>
                <span>Pourboire application</span>
                <b>
                  {row.appTip === null ? "—" : money(row.appTip || 0)}
                </b>
              </div>
              <div>
                <span>Pourboire fiche Téo</span>
                <b>
                  {row.status === "missing-pay" ? "—" : money(row.tip)}
                </b>
              </div>
            </>
          )}
          {isCouponPayRow(row) && row.appTip !== null && (
            <div>
              <span>Pourboire saisi manuellement</span>
              <b>{money(row.appTip || 0)}</b>
            </div>
          )}
        </div>
        {row.status !== "ok" && (
          <div className="pay-course-actions">
            {row.status === "missing-app" && (
              <button
                type="button"
                className="correct-teo"
                onClick={() => savePayRow(row)}
              >
                Enregistrer dans l’application
              </button>
            )}
            {row.status === "different" && row.courseId && (
              <button
                type="button"
                className="correct-teo"
                onClick={() => correctFromTeo(row)}
              >
                Corriger selon Téo
              </button>
            )}
            {row.courseId && (
              <>
                <select
                  aria-label={`Changer le mode de paiement de ${title}`}
                  defaultValue=""
                  onChange={(event) => {
                    if (event.target.value)
                      changeCoursePayment(row.courseId!, event.target.value);
                  }}
                >
                  <option value="" disabled>
                    Changer paiement
                  </option>
                  <option value="Téo / carte">Téo / carte</option>
                  <option value="Espèces">Espèces</option>
                  <option value="Coupon">Coupon</option>
                  <option value="Machine crédit">Machine crédit</option>
                </select>
                <button
                  type="button"
                  className="check-delete"
                  onClick={() => deleteCheckedCourse(row.courseId!)}
                >
                  Supprimer
                </button>
              </>
            )}
          </div>
        )}
      </article>
    );
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
        <button
          className="expense-desktop-launch"
          type="button"
          onClick={() => {
            setMobilePage(mobilePage === "expenses" ? "add" : "expenses");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        >
          {mobilePage === "expenses" ? "← Retour aux courses" : "🧾 Dépenses taxi"}
        </button>
        <div className="account-pill" title={user.email || "Compte chauffeur"}>
          <span>{(user.displayName || user.email || "C").charAt(0).toUpperCase()}</span>
          <div><b>{user.displayName || "Chauffeur"}</b><small>{syncState === "saving" ? "Enregistrement…" : syncState === "error" ? "Erreur de sauvegarde" : "Données enregistrées"}</small></div>
        </div>
      </header>
      <div className={`shell page-${mobilePage} tab-${tab}`}>
        <section className="summary">
          <div>
            <span>Revenu net de la semaine</span>
            <strong>
              {money(
                totals.gross -
                  totals.deductions -
                  airportFeeTotal -
                  weeklyCompanyFee -
                  weeklyExpenseTotal,
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
                    {money(dailyGoalNet)} / {money(dailyGoal)}
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
                  {dailyGoal > 0 && dailyGoalNet >= dailyGoal
                    ? "Objectif atteint ✓"
                    : `${money(Math.max(0, dailyGoal - dailyGoalNet))} restant`}
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
              − {money(totals.deductions + airportFeeTotal + weeklyCompanyFee + weeklyExpenseTotal)}
            </b>
            {weeklyCompanyFee > 0 && (
              <small>
                dont {money(weeklyCompanyFee)} de frais de compagnie
              </small>
            )}
            {weeklyExpenseTotal > 0 && (
              <small>dont {money(weeklyExpenseTotal)} de dépenses taxi</small>
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
                  <p>Saisissez le total affiché dans Téo et le pourboire.</p>
                </div>
                <span className="type-icon">$</span>
              </div>
              {!editingId && (
                <section className="photo-import">
                  <div className="photo-import-head">
                    <div>
                      <b>Importer les courses de la tablette</b>
                      <small>Seules les courses marquées « Carte » seront conservées.</small>
                    </div>
                    <span>▣</span>
                  </div>
                  <label className={`photo-upload ${photoReading ? "disabled" : ""}`}>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      disabled={photoReading}
                      onChange={(event) => {
                        readTabletPhotos(event.target.files);
                        event.target.value = "";
                      }}
                    />
                    {photoReading ? `Analyse en cours${photoProgress ? ` · ${photoProgress} %` : ""}` : "Prendre ou choisir des photos"}
                  </label>
                  {photoMessage && <p className="photo-message" role="status">{photoMessage}</p>}
                  {photoCourses.length > 0 && (
                    <div className="photo-results">
                      {photoCourses.map((item) => {
                        const total = parseMoneyInput(item.total);
                        const tip = parseMoneyInput(item.tip);
                        return (
                          <article className={!item.selected ? "unselected" : ""} key={item.id}>
                            <div className="photo-row-title">
                              <label>
                                <input type="checkbox" checked={item.selected} onChange={(event) => setPhotoCourses((current) => current.map((course) => course.id === item.id ? { ...course, selected: event.target.checked } : course))} />
                                Course par carte
                              </label>
                              <button type="button" aria-label="Supprimer cette course" onClick={() => setPhotoCourses((current) => current.filter((course) => course.id !== item.id))}>×</button>
                            </div>
                            <div className="photo-fields">
                              <label>Date<input type="date" value={item.date} onChange={(event) => setPhotoCourses((current) => current.map((course) => course.id === item.id ? { ...course, date: event.target.value } : course))} /></label>
                              <label>Total tablette, pourboire inclus<input inputMode="decimal" value={item.total} onChange={(event) => setPhotoCourses((current) => current.map((course) => course.id === item.id ? { ...course, total: autoCommaMoneyInput(event.target.value) } : course))} /></label>
                              <label>Pourboire inclus<input inputMode="decimal" required={item.selected} placeholder="0,00" value={item.tip} onChange={(event) => setPhotoCourses((current) => current.map((course) => course.id === item.id ? { ...course, tip: autoCommaMoneyInput(event.target.value) } : course))} /></label>
                              {settings.airportEnabled && <label>Type<select value={item.category} onChange={(event) => setPhotoCourses((current) => current.map((course) => course.id === item.id ? { ...course, category: event.target.value as PhotoCourse["category"] } : course))}><option value="centre-ville">Centre-ville</option><option value="aeroport">Aéroport</option></select></label>}
                            </div>
                            <small className="photo-calculation">Montant avant pourboire : <b>{money(Math.max(0, total - tip))}</b> · Pourboire : <b>{item.tip === "" ? "à saisir" : money(tip)}</b></small>
                          </article>
                        );
                      })}
                      <button type="button" className="primary photo-save" onClick={savePhotoCourses}>Enregistrer les courses sélectionnées</button>
                    </div>
                  )}
                </section>
              )}
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
                  Montant total, pourboire inclus
                  <div className="money-input">
                    <span>$</span>
                    <input
                      inputMode="decimal"
                      placeholder="0,00"
                      value={taxi.amount}
                      required
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
                  Pourboire inclus dans le total
                  <div className="money-input">
                    <span>$</span>
                    <input
                      inputMode="decimal"
                      placeholder="0,00"
                      value={taxi.tip}
                      required
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
              <div
                className={`taxi-breakdown ${
                  parseMoneyInput(taxi.tip) > parseMoneyInput(taxi.amount)
                    ? "invalid"
                    : ""
                }`}
              >
                <div>
                  <span>Montant avant pourboire</span>
                  <b>
                    {money(
                      Math.max(
                        0,
                        parseMoneyInput(taxi.amount) -
                          parseMoneyInput(taxi.tip),
                      ),
                    )}
                  </b>
                </div>
                <div>
                  <span>Pourboire</span>
                  <b>{money(parseMoneyInput(taxi.tip))}</b>
                </div>
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
              {taxi.payment === "Coupon" && (
                <section className="coupon-fields">
                  <div className="two coupon-identifiers">
                    <label>
                      Numéro du coupon
                      <input
                        type="text"
                        autoCapitalize="characters"
                        autoComplete="off"
                        maxLength={40}
                        placeholder="Ex. CP-001245"
                        value={taxi.couponNumber}
                        onChange={(e) =>
                          setTaxi({
                            ...taxi,
                            couponNumber: e.target.value.toUpperCase(),
                          })
                        }
                        required
                      />
                    </label>
                    <label>
                      Numéro de compte
                      <input
                        type="text"
                        autoCapitalize="characters"
                        autoComplete="off"
                        maxLength={40}
                        placeholder="Ex. CH-407"
                        value={taxi.couponAccount}
                        onChange={(e) =>
                          setTaxi({
                            ...taxi,
                            couponAccount: e.target.value.toUpperCase(),
                          })
                        }
                        required
                      />
                    </label>
                  </div>
                  <label className="coupon-status-field">
                    Statut du coupon
                    <select
                      value={taxi.couponStatus}
                      onChange={(e) =>
                        setTaxi({
                          ...taxi,
                          couponStatus: e.target.value as CouponStatus,
                        })
                      }
                    >
                      <option value="pending">Non déposé</option>
                      <option value="deposited">Déposé dans l’app Téo</option>
                      <option value="fuel">Utilisé pour l’essence</option>
                    </select>
                  </label>
                  <small>
                    Ces numéros servent à retrouver le coupon déposé dans la
                    fiche de paie. Frais appliqués : le même taux que Téo, soit{" "}
                    {settings.cardFee.toLocaleString("fr-CA", {
                      maximumFractionDigits: 3,
                    })}
                    &nbsp;%.
                  </small>
                </section>
              )}
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
              <div className="form-title pay-page-head">
                <div>
                  <h2>Vérifier paie</h2>
                  <p>Comparez chaque fiche Téo avec vos courses.</p>
                </div>
                <span className="type-icon">📄</span>
              </div>
              <section className="pay-import-section">
                <div className="pay-section-title">
                  <span>1</span>
                  <div>
                    <h3>Importer une fiche</h3>
                    <p>
                      Seules les dates de courses inscrites dans le PDF sont
                      vérifiées.
                    </p>
                  </div>
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
                  <small>
                    {payFile ||
                      "Courses carte, coupons déposés et tournées HOB"}
                  </small>
                </label>
                {payError && <p className="error-box">{payError}</p>}
              </section>
              {payStatements.length > 0 && (
                <section className="saved-statements">
                  <div className="pay-section-title statement-list-title">
                    <span>2</span>
                    <div>
                      <h3>Fiches enregistrées</h3>
                      <p>Choisissez une fiche pour voir son analyse.</p>
                    </div>
                    <strong>{payStatements.length}</strong>
                  </div>
                  <div className="bill-filters">
                    <label>
                      <span>Rechercher une fiche</span>
                      <input
                        type="search"
                        value={billSearch}
                        onChange={(event) => {
                          setBillSearch(event.target.value);
                          closeSelectedPayStatement();
                        }}
                        placeholder="No BILL ou date"
                      />
                    </label>
                    <label>
                      <span>État</span>
                      <select
                        value={billStatus}
                        onChange={(event) => {
                          setBillStatus(
                            event.target.value as "all" | "issues" | "clear",
                          );
                          closeSelectedPayStatement();
                        }}
                      >
                        <option value="all">Toutes</option>
                        <option value="issues">À vérifier</option>
                        <option value="clear">Sans anomalie</option>
                      </select>
                    </label>
                    <label>
                      <span>Période des courses</span>
                      <select
                        value={billPeriod}
                        onChange={(event) => {
                          setBillPeriod(event.target.value as typeof billPeriod);
                          closeSelectedPayStatement();
                        }}
                      >
                        <option value="all">Toutes les dates</option>
                        <option value="last-week">Semaine précédente</option>
                        <option value="month">Mois en cours</option>
                        <option value="custom">Période personnalisée</option>
                      </select>
                    </label>
                  </div>
                  {billPeriod === "custom" && (
                    <div className="custom-period bill-custom-period">
                      <label>
                        Du
                        <input
                          type="date"
                          value={billCustomStart}
                          max={billCustomEnd}
                          onChange={(event) => {
                            setBillCustomStart(event.target.value);
                            closeSelectedPayStatement();
                          }}
                        />
                      </label>
                      <label>
                        Au
                        <input
                          type="date"
                          value={billCustomEnd}
                          min={billCustomStart}
                          onChange={(event) => {
                            setBillCustomEnd(event.target.value);
                            closeSelectedPayStatement();
                          }}
                        />
                      </label>
                    </div>
                  )}
                  <p className="bill-filter-count">
                    {filteredPayStatements.length} fiche
                    {filteredPayStatements.length !== 1 ? "s" : ""} affichée
                    {filteredPayStatements.length !== 1 ? "s" : ""} sur {" "}
                    {payStatements.length}
                  </p>
                  {filteredPayStatements.length === 0 && (
                    <p className="bill-filter-empty">
                      Aucune fiche ne correspond à ce filtre.
                    </p>
                  )}
                  {filteredPayStatements.map((statement) => (
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
                        onClick={() => togglePayStatement(statement)}
                      >
                        <span>
                          <b>{statement.id}</b>
                          <small>
                            Courses :{" "}
                            {getPayrollCourseDates(statement.rows).join(" · ")} ·{" "}
                            {statement.rows.length} lignes
                          </small>
                          {Boolean(statementWarnings[statement.id]) && (
                            <em className="statement-warning">
                              ⚠ {statementWarnings[statement.id]} course
                              {statementWarnings[statement.id] > 1 ? "s" : ""} à
                              vérifier
                            </em>
                          )}
                          {!statementWarnings[statement.id] && (
                            <em className="statement-clear">
                              ✓ Sans anomalie
                            </em>
                          )}
                        </span>
                        <span className="statement-total">
                          <strong>{money(statement.total)}</strong>
                          <small>
                            {statement.id === selectedStatementId
                              ? "Fermer ▲"
                              : "Analyser ›"}
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
                                <span>Dates des courses vérifiées</span>
                                <b>
                                  {getPayrollCourseDates(statement.rows).join(
                                    " · ",
                                  ) || "—"}
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
                                    <b>{payRowTitle(row)}</b>
                                    <span>{row.date}</span>
                                    <span>
                                      {isCouponPayRow(row)
                                        ? `Compte ${row.couponAccount || "non lu"}`
                                        : `Course ${money(row.amount)}`}
                                    </span>
                                    <span>
                                      {isCouponPayRow(row)
                                        ? "Coupon déposé"
                                        : `Pourboire ${money(row.tip)}`}
                                    </span>
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
                                    <b>{payRowTitle(row)}</b>
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
                                            : isCouponPayRow(row)
                                              ? "Coupon et compte trouvés · total différent"
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
                                        !isCouponPayRow(row) &&
                                        ` · Pourboire ${money(row.tip)}`}
                                    </small>
                                    {isCouponPayRow(row) && (
                                      <small>
                                        Compte {row.couponAccount || "non lu"}
                                        {row.appTip !== null
                                          ? ` · Pourboire saisi ${money(row.appTip || 0)}`
                                          : ""}
                                      </small>
                                    )}
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
              {selectedPayStatement && (
                <section
                  className="pay-analysis"
                  id="pay-statement-analysis"
                >
                  <div className="pay-section-title analysis-title">
                    <span>3</span>
                    <div>
                      <h3>Analyse de {selectedPayStatement.id}</h3>
                      <p>
                        Courses du {" "}
                        {getPayrollCourseDates(selectedPayStatement.rows).join(
                          " · ",
                        ) || "—"}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="pay-analysis-close"
                      onClick={closeSelectedPayStatement}
                      aria-label="Fermer l’analyse de la fiche"
                    >
                      ×
                    </button>
                  </div>

                  <div className="pay-check-summary">
                    <div className="matching">
                      <span>Correspondent</span>
                      <b>{comparisonMatches.length}</b>
                    </div>
                    <div className={comparisonIssues.length ? "warning" : "matching"}>
                      <span>À vérifier</span>
                      <b>{comparisonIssues.length}</b>
                    </div>
                    <div>
                      <span>Lignes du PDF</span>
                      <b>{selectedPayStatement.rows.length}</b>
                    </div>
                    <div className="total">
                      <span>Total de la fiche</span>
                      <b>{money(selectedPayStatement.total)}</b>
                    </div>
                  </div>

                  <details className="pay-detail-group">
                    <summary>
                      <span>Détails du paiement</span>
                      <small>Voir les montants et les dates</small>
                    </summary>
                    <div className="statement-grid pay-statement-grid">
                      <div>
                        <span>Date de la facture</span>
                        <b>{selectedPayStatement.invoiceDate || "—"}</b>
                      </div>
                      <div>
                        <span>Dates des courses vérifiées</span>
                        <b>
                          {getPayrollCourseDates(
                            selectedPayStatement.rows,
                          ).join(" · ") || "—"}
                        </b>
                      </div>
                      <div>
                        <span>Sous-total</span>
                        <b>{money(selectedPayStatement.subtotal)}</b>
                      </div>
                      <div>
                        <span>Date du paiement</span>
                        <b>{selectedPayStatement.paidDate || "—"}</b>
                      </div>
                      <div>
                        <span>Montant payé</span>
                        <b>{money(selectedPayStatement.paidAmount)}</b>
                      </div>
                      <div>
                        <span>Montant dû</span>
                        <b>{money(selectedPayStatement.amountDue)}</b>
                      </div>
                    </div>
                  </details>

                  <section className="pay-issues-section">
                    <div className="pay-group-head">
                      <div>
                        <h4>Courses à vérifier</h4>
                        <p>Les différences à corriger sont affichées en premier.</p>
                      </div>
                      <span>{comparisonIssues.length}</span>
                    </div>
                    {comparisonIssues.length === 0 ? (
                      <div className="pay-all-clear">
                        <span>✓</span>
                        <div>
                          <b>Tout correspond</b>
                          <small>
                            Aucune différence détectée pour cette fiche.
                          </small>
                        </div>
                      </div>
                    ) : (
                      <div className="pay-course-list">
                        {comparisonIssues.map((row, index) =>
                          renderPayComparison(row, index, "issue"),
                        )}
                      </div>
                    )}
                  </section>

                  {comparisonMatches.length > 0 && (
                    <details className="pay-detail-group pay-matches-group">
                      <summary>
                        <span>Courses qui correspondent</span>
                        <small>
                          {comparisonMatches.length} course
                          {comparisonMatches.length !== 1 ? "s" : ""}
                        </small>
                      </summary>
                      <div className="pay-course-list">
                        {comparisonMatches.map((row, index) =>
                          renderPayComparison(row, index, "match"),
                        )}
                      </div>
                    </details>
                  )}

                  <details className="pay-detail-group pay-pdf-group">
                    <summary>
                      <span>Toutes les lignes du PDF</span>
                      <small>{selectedPayStatement.rows.length} lignes</small>
                    </summary>
                    <div className="statement-lines">
                      {selectedPayStatement.rows.map((row, index) => (
                        <div key={`${row.key}-${row.date}-${index}`}>
                          <b>{payRowTitle(row)}</b>
                          <span>{row.date}</span>
                          <span>
                            {isCouponPayRow(row)
                              ? `Compte ${row.couponAccount || "non lu"}`
                              : `Course ${money(row.amount)}`}
                          </span>
                          <span>
                            {isCouponPayRow(row)
                              ? "Coupon déposé"
                              : `Pourboire ${money(row.tip)}`}
                          </span>
                          <strong>{money(row.amount + row.tip)}</strong>
                        </div>
                      ))}
                    </div>
                  </details>
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
              <div className="form-title settings-page-head">
                <div>
                  <h2>Réglages</h2>
                  <p>Personnalisez les services, objectifs et frais.</p>
                </div>
                <span className="type-icon">⚙</span>
              </div>
              <section className="settings-section settings-account-section">
                <div className="settings-section-heading">
                  <span>👤</span>
                  <div>
                    <h3>Mon compte</h3>
                    <p>Vos données sont enregistrées dans ce compte.</p>
                  </div>
                </div>
                <div className="account-settings">
                  <span className="settings-avatar">
                    {(user.displayName || user.email || "C")
                      .charAt(0)
                      .toUpperCase()}
                  </span>
                  <div>
                    <b>{user.displayName || "Compte chauffeur"}</b>
                    <small>{user.email}</small>
                  </div>
                  <button type="button" onClick={() => signOut(auth)}>
                    Se déconnecter
                  </button>
                </div>
              </section>
              <section className="settings-section">
                <div className="settings-section-heading">
                  <span>🚕</span>
                  <div>
                    <h3>Services utilisés</h3>
                    <p>Affichez uniquement les services que vous conduisez.</p>
                  </div>
                </div>
                <div className="service-options">
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
              </section>
              <section className="settings-section settings-goal-section">
                <div className="settings-toggle-heading">
                  <div className="settings-section-heading">
                    <span>🎯</span>
                    <div>
                      <h3>Objectif quotidien</h3>
                      <p>Suivez votre progression dans le résumé.</p>
                    </div>
                  </div>
                  <label className="settings-master-switch">
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
                    <span>{settings.dailyGoalEnabled ? "Activé" : "Désactivé"}</span>
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
              </section>
              <section className="settings-section">
                <div className="settings-section-heading">
                  <span>%</span>
                  <div>
                    <h3>Frais taxi</h3>
                    <p>Taux déduits automatiquement de vos revenus.</p>
                  </div>
                </div>
                <div className="settings-grid">
                  <label className="setting-field">
                    <span>
                      <b>Frais Téo / carte</b>
                      <small>Pour les paiements Téo et par carte</small>
                    </span>
                    <div className="setting-number">
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
                      <em>%</em>
                    </div>
                  </label>
                  <label className="setting-field">
                    <span>
                      <b>Machine crédit</b>
                      <small>Frais du terminal de paiement externe</small>
                    </span>
                    <div className="setting-number">
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
                      <em>%</em>
                    </div>
                  </label>
                  <label className="setting-field">
                    <span>
                      <b>Frais de compagnie</b>
                      <small>Prélevés une fois chaque mardi</small>
                    </span>
                    <div className="setting-number">
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
                      <em>$</em>
                    </div>
                  </label>
                  {settings.airportEnabled && (
                    <label className="setting-field">
                      <span>
                        <b>Redevance aéroport</b>
                        <small>Montant déduit par course aéroport</small>
                      </span>
                      <div className="setting-number">
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
                        <em>$</em>
                      </div>
                    </label>
                  )}
                </div>
              </section>
              {settings.adaptedEnabled && (
                <section className="settings-section">
                  <div className="settings-section-heading">
                    <span>♿</span>
                    <div>
                      <h3>Transport adapté</h3>
                      <p>Tarif horaire, minimum payé et frais Téo.</p>
                    </div>
                  </div>
                  <div className="settings-grid adapted-settings-grid">
                    <label className="setting-field">
                      <span>
                        <b>Taux horaire</b>
                        <small>Montant brut avant les frais</small>
                      </span>
                      <div className="setting-number">
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
                        <em>$/h</em>
                      </div>
                    </label>
                    <label className="setting-field">
                      <span>
                        <b>Minimum payé</b>
                        <small>Même si la tournée dure moins longtemps</small>
                      </span>
                      <div className="setting-number">
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
                        <em>h</em>
                      </div>
                    </label>
                    <label className="setting-field">
                      <span>
                        <b>Frais Téo adapté</b>
                        <small>Pourcentage retiré de la tournée</small>
                      </span>
                      <div className="setting-number">
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
                        <em>%</em>
                      </div>
                    </label>
                  </div>
                </section>
              )}
              <section className="settings-section settings-calendar-section">
                <div className="settings-section-heading">
                  <span>📅</span>
                  <div>
                    <h3>Calendrier des calculs</h3>
                    <p>Jours utilisés automatiquement par l’application.</p>
                  </div>
                </div>
                <div className="settings-schedule">
                  <div className="setting-row">
                    <div>
                      <b>Semaine de revenus</b>
                      <span>Calcul du revenu hebdomadaire</span>
                    </div>
                    <strong>Mardi au lundi</strong>
                  </div>
                  <div className="setting-row">
                    <div>
                      <b>Frais de compagnie</b>
                      <span>Déduits une fois au début de la semaine</span>
                    </div>
                    <strong>Chaque mardi</strong>
                  </div>
                  {settings.airportEnabled && (
                    <div className="setting-row">
                      <div>
                        <b>Redevance aéroport</b>
                        <span>Facture de redevance envoyée le lundi</span>
                      </div>
                      <strong>Lundi au dimanche</strong>
                    </div>
                  )}
                </div>
              </section>
              <div className={`settings-saved ${syncState}`}>
                <span>{syncState === "error" ? "!" : "✓"}</span>
                <div className="settings-save-copy">
                  <b>
                    {syncState === "saving"
                      ? "Enregistrement en cours…"
                      : syncState === "error"
                        ? "Erreur d’enregistrement"
                        : "Réglages enregistrés"}
                  </b>
                  <small>
                    {syncState === "error"
                      ? "Vérifiez votre connexion puis réessayez."
                      : "Les changements sont sauvegardés automatiquement."}
                  </small>
                </div>
              </div>
              <button
                type="button"
                className="reset-settings"
                onClick={() => setSettings(DEFAULT_SETTINGS)}
              >
                Rétablir tous les réglages d’origine
              </button>
            </div>
          )}
        </section>
        {mobilePage === "expenses" && (
          <section className="expenses-page" id="expenses">
            <div className="expenses-heading">
              <div>
                <span className="expenses-kicker">🚕 Gestion des coûts</span>
                <h2>Dépenses taxi</h2>
                <p>Enregistrez vos dépenses et suivez leur effet sur votre revenu net.</p>
              </div>
              <div className="expenses-total-card">
                <span>Total affiché</span>
                <b>− {money(filteredExpenseTotal)}</b>
                <small>{filteredExpenses.length} dépense{filteredExpenses.length !== 1 ? "s" : ""}</small>
              </div>
            </div>

            <form className="expense-form" onSubmit={saveExpense}>
              <div className="form-title">
                <div>
                  <h3>{expenseEditingId ? "Modifier la dépense" : "Nouvelle dépense"}</h3>
                  <p>Le montant sera déduit de la semaine correspondant à la date.</p>
                </div>
                <span className="type-icon">🧾</span>
              </div>
              <div className="two">
                <label>
                  Date
                  <input
                    required
                    type="date"
                    value={expenseForm.date}
                    onChange={(event) => setExpenseForm({ ...expenseForm, date: event.target.value })}
                  />
                </label>
                <label>
                  Catégorie
                  <select
                    value={expenseForm.category}
                    onChange={(event) => setExpenseForm({ ...expenseForm, category: event.target.value as TaxiExpense["category"] })}
                  >
                    {EXPENSE_CATEGORIES.map((category) => (
                      <option key={category} value={category}>{EXPENSE_ICONS[category]} {category}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="two">
                <label>
                  Montant
                  <div className="money-input">
                    <span>$</span>
                    <input
                      required
                      inputMode="numeric"
                      placeholder="0,00"
                      value={expenseForm.amount}
                      onChange={(event) => setExpenseForm({ ...expenseForm, amount: autoCommaMoneyInput(event.target.value) })}
                    />
                    <em>CAD</em>
                  </div>
                </label>
                <label>
                  Payé avec
                  <select
                    value={expenseForm.payment}
                    onChange={(event) => setExpenseForm({ ...expenseForm, payment: event.target.value as TaxiExpense["payment"] })}
                  >
                    <option value="Carte">💳 Carte</option>
                    <option value="Espèces">💵 Espèces</option>
                    <option value="Compte bancaire">🏦 Compte bancaire</option>
                  </select>
                </label>
              </div>
              <label>
                Note <small>(facultatif)</small>
                <input
                  maxLength={120}
                  placeholder="Ex. plein d’essence, changement d’huile…"
                  value={expenseForm.note}
                  onChange={(event) => setExpenseForm({ ...expenseForm, note: event.target.value })}
                />
              </label>
              <button className="primary" type="submit">
                {expenseEditingId ? "Enregistrer la modification" : "Ajouter la dépense"}
              </button>
              {expenseEditingId && (
                <button className="cancel-edit" type="button" onClick={() => resetExpenseForm()}>
                  Annuler la modification
                </button>
              )}
            </form>

            <section className="expense-history">
              <div className="section-head">
                <div>
                  <h3>Historique des dépenses</h3>
                  <p>Choisissez la période à afficher.</p>
                </div>
                <select
                  aria-label="Période des dépenses"
                  value={expensePeriod}
                  onChange={(event) => setExpensePeriod(event.target.value as typeof expensePeriod)}
                >
                  <option value="week">Cette semaine</option>
                  <option value="month">Ce mois-ci</option>
                  <option value="all">Toutes</option>
                </select>
              </div>
              {filteredExpenses.length === 0 ? (
                <div className="empty compact">
                  <span>🧾</span>
                  <h3>Aucune dépense</h3>
                  <p>Les dépenses de cette période apparaîtront ici.</p>
                </div>
              ) : (
                <div className="expense-list">
                  {filteredExpenses.map((expense) => (
                    <article className="expense-item" key={expense.id}>
                      <span className="expense-icon" aria-hidden="true">{EXPENSE_ICONS[expense.category]}</span>
                      <div className="expense-info">
                        <b>{expense.category}</b>
                        <span>{new Date(`${expense.date}T12:00:00`).toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" })} · {expense.payment}</span>
                        {expense.note && <small>{expense.note}</small>}
                      </div>
                      <strong>− {money(expense.amount)}</strong>
                      <div className="course-actions">
                        <button aria-label="Modifier la dépense" className="edit" type="button" onClick={() => editExpense(expense)}>✎</button>
                        <button aria-label="Supprimer la dépense" className="delete" type="button" onClick={() => deleteExpense(expense.id)}>×</button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </section>
        )}
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
                <span>Total avec pourboires</span>
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
                    <span
                      className={`course-icon ${c.type}`}
                      aria-hidden="true"
                    >
                      {courseEmoji(c)}
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
                      {c.payment === "Coupon" && (
                        <>
                          <small className="coupon-course-reference">
                            Coupon {c.couponNumber || "sans numéro"} · Compte{" "}
                            {c.couponAccount || "non indiqué"}
                          </small>
                          <small
                            className={`coupon-course-status ${couponStatusOf(c)}`}
                          >
                            {COUPON_STATUS_LABELS[couponStatusOf(c)]}
                          </small>
                        </>
                      )}
                      <div className="daily-details">
                        <span>
                          <em>Total avec pourboire</em>
                          <b>{money(c.amount + c.tip)}</b>
                        </span>
                        {c.type === "taxi" ? (
                          <>
                            <span>
                              <em>Montant avant pourboire</em>
                              <b>{money(c.amount)}</b>
                            </span>
                            <span>
                              <em>Pourboire</em>
                              <b>{money(c.tip)}</b>
                            </span>
                          </>
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
                <label className="history-search">
                  <span>Rechercher</span>
                  <input
                    placeholder="HOB, ID, coupon ou compte…"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                  />
                </label>
                <label>
                  <span>Type de course</span>
                  <select
                    value={historyType}
                    onChange={(e) =>
                      setHistoryType(e.target.value as typeof historyType)
                    }
                  >
                    <option value="all">Toutes</option>
                    <option value="taxi">Taxi</option>
                    <option value="adapte">Adapté</option>
                  </select>
                </label>
                <label>
                  <span>Mode de paiement</span>
                  <select
                    value={historyPayment}
                    onChange={(e) =>
                      setHistoryPayment(
                        e.target.value as HistoryPaymentFilter,
                      )
                    }
                  >
                    <option value="all">Tous</option>
                    <option value="teo-card">Téo / carte</option>
                    <option value="cash">Espèces</option>
                    <option value="coupon">Coupon</option>
                    <option value="machine">Machine crédit</option>
                    <option value="adapted">Transport adapté</option>
                  </select>
                </label>
                <label>
                  <span>Période</span>
                  <select
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
                </label>
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
              <section className="history-overview">
                <header className="history-block-heading">
                  <div>
                    <b>Résumé de la période</b>
                    <small>Calculé avec les courses affichées</small>
                  </div>
                </header>
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
                      course{unverifiedHistoryCount !== 1 ? "s" : ""} non
                      vérifiée{unverifiedHistoryCount !== 1 ? "s" : ""} dans
                      cette période
                    </small>
                  </div>
                </div>
              </section>
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
            <section className="history-results">
              <header className="history-block-heading history-results-heading">
                <div>
                  <b>Courses par date</b>
                  <small>
                    {filteredHistory.length} course
                    {filteredHistory.length !== 1 ? "s" : ""} dans la période
                  </small>
                </div>
              </header>
              {historyGroups.map((group) => (
                <section className="history-day-group" key={group.date}>
                <header className="history-date">
                  <span>
                    {new Date(group.date + "T12:00").toLocaleDateString(
                      "fr-CA",
                      {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                      },
                    )}
                  </span>
                  <small>
                    {group.courses.length} course
                    {group.courses.length !== 1 ? "s" : ""}
                  </small>
                </header>
                <div className="history-day-courses">
                  {group.courses.map((c) => {
                    const fee = serviceFee(c, settings),
                      perception = c.perception || 0,
                      deductions = fee + perception,
                      gross = c.amount + c.tip,
                      payment = isCardPayment(c.payment)
                        ? "Téo / carte"
                        : c.payment === "Autre"
                          ? "Machine crédit"
                          : c.payment;
                    return (
                      <article className="course history-course" key={c.id}>
                        <div
                          className={`course-icon ${c.type}`}
                          aria-hidden="true"
                        >
                          {courseEmoji(c)}
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
                            {c.type === "taxi"
                              ? `${payment}${c.taxiCategory === "aeroport" ? " · Aéroport" : ""}`
                              : `${c.duration?.toFixed(2)} h réelles · ${(c.billedDuration || Math.max(c.duration || 0, settings.adaptedMinimum)).toFixed(2)} h payées`}
                          </span>
                          {c.payment === "Coupon" && (
                            <>
                              <span className="coupon-course-reference">
                                Coupon {c.couponNumber || "sans numéro"} ·
                                Compte {c.couponAccount || "non indiqué"}
                              </span>
                              <span
                                className={`coupon-course-status ${couponStatusOf(c)}`}
                              >
                                {COUPON_STATUS_LABELS[couponStatusOf(c)]}
                              </span>
                            </>
                          )}
                          {c.verified && (
                            <span className="verified-course">
                              ✓ Vérifiée
                              {c.type === "taxi" && c.payment === "Coupon"
                                ? c.couponNumber
                                  ? ` · Coupon ${c.couponNumber}`
                                  : ""
                                : c.type === "taxi" && c.teoId
                                  ? ` · ID ${c.teoId}`
                                  : c.hob
                                    ? ` · ID ${c.hob}`
                                    : ""}
                              {c.verifiedBillId
                                ? ` · ${c.verifiedBillId}`
                                : ""}
                            </span>
                          )}
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
                        <div className="history-course-values">
                          <div>
                            <span>
                              {c.type === "taxi"
                                ? "Total avec pourboire"
                                : "Montant payé"}
                            </span>
                            <b>{money(gross)}</b>
                          </div>
                          {c.type === "taxi" && (
                            <>
                              <div>
                                <span>Avant pourboire</span>
                                <b>{money(c.amount)}</b>
                              </div>
                              <div>
                                <span>Pourboire</span>
                                <b>{money(c.tip)}</b>
                              </div>
                            </>
                          )}
                          <div>
                            <span>Frais Téo</span>
                            <b>− {money(fee)}</b>
                          </div>
                          {perception > 0 && (
                            <div>
                              <span>Perception STM</span>
                              <b>− {money(perception)}</b>
                            </div>
                          )}
                          <div className="history-net">
                            <span>Net</span>
                            <b>{money(gross - deductions)}</b>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
                </section>
              ))}
            </section>
          )}
          {courses.length > 0 && (
            <section className="coupon-history-card history-coupon-footer">
              <header>
                <span aria-hidden="true">🎟️</span>
                <div>
                  <b>Suivi des coupons</b>
                  <small>
                    {historyCouponCount} coupon
                    {historyCouponCount !== 1 ? "s" : ""} ·{" "}
                    {money(historyCouponAmount)} dans la période affichée
                  </small>
                </div>
              </header>
              <div className="coupon-history-grid">
                <div className="deposited">
                  <span>✓ Déposés dans Téo</span>
                  <b>{money(historyCouponSummary.deposited.amount)}</b>
                  <small>
                    {historyCouponSummary.deposited.count} coupon
                    {historyCouponSummary.deposited.count !== 1 ? "s" : ""}
                  </small>
                </div>
                <div className="pending">
                  <span>◷ Non déposés</span>
                  <b>{money(historyCouponSummary.pending.amount)}</b>
                  <small>
                    {historyCouponSummary.pending.count} coupon
                    {historyCouponSummary.pending.count !== 1 ? "s" : ""}
                  </small>
                </div>
                <div className="fuel">
                  <span>⛽ Essence</span>
                  <b>{money(historyCouponSummary.fuel.amount)}</b>
                  <small>
                    {historyCouponSummary.fuel.count} coupon
                    {historyCouponSummary.fuel.count !== 1 ? "s" : ""}
                  </small>
                </div>
              </div>
            </section>
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
          className={mobilePage === "expenses" ? "selected" : ""}
          onClick={() => {
            setMobilePage("expenses");
            setEditingId(null);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        >
          🧾<span>Dépenses</span>
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
