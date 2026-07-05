import { SUPPORTED_LOCALES, type Locale } from '@youniversity2/shared';

type Messages = Record<string, string>;

const sk: Messages = {
  'app.title': 'YOUniversity2',
  'nav.dashboard': 'Prehľad',
  'nav.courses': 'Kurzy',
  'nav.admin': 'Administrácia',
  'nav.logout': 'Odhlásiť sa',
  'auth.login': 'Prihlásenie',
  'auth.email': 'E-mail',
  'auth.password': 'Heslo',
  'auth.submit': 'Prihlásiť sa',
  'auth.register': 'Registrovať sa',
  'auth.name': 'Meno',
  'courses.title': 'Moje kurzy',
  'courses.empty': 'Nemáte priradené žiadne kurzy.',
  'courses.open': 'Otvoriť kurz',
  'course.modules': 'Moduly',
  'course.lessons': 'Lekcie',
  'course.progress': 'Postup',
  'admin.activity': 'Aktivita v reálnom čase',
  'admin.translate': 'Preložiť AI',
  'realtime.connected': 'Pripojené',
  'realtime.disconnected': 'Odpojené',
  'locale.label': 'Jazyk',
};

const en: Messages = {
  'app.title': 'YOUniversity2',
  'nav.dashboard': 'Dashboard',
  'nav.courses': 'Courses',
  'nav.admin': 'Administration',
  'nav.logout': 'Log out',
  'auth.login': 'Login',
  'auth.email': 'Email',
  'auth.password': 'Password',
  'auth.submit': 'Sign in',
  'auth.register': 'Register',
  'auth.name': 'Name',
  'courses.title': 'My courses',
  'courses.empty': 'You have no enrolled courses.',
  'courses.open': 'Open course',
  'course.modules': 'Modules',
  'course.lessons': 'Lessons',
  'course.progress': 'Progress',
  'admin.activity': 'Real-time activity',
  'admin.translate': 'AI Translate',
  'realtime.connected': 'Connected',
  'realtime.disconnected': 'Disconnected',
  'locale.label': 'Language',
};

const catalogs: Record<Locale, Messages> = { sk, en, cs: sk, de: en, hu: sk };

export function t(key: string, loc: Locale): string {
  return catalogs[loc]?.[key] ?? catalogs.sk[key] ?? key;
}

export { SUPPORTED_LOCALES };
