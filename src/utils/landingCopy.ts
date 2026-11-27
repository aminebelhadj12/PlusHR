import type { AppLang } from '../types';

export const landingCopy: Record<AppLang, {
  productTitle: string;
  headline: string;
  description: string;
  login: string;
  homeLabel: string;
  navigationLabel: string;
  languageLabel: string;
  discover: string;
  featuresNav: string;
  platformNav: string;
  featureEyebrow: string;
  featureHeading: string;
  featureDescription: string;
  platformEyebrow: string;
  platformHeading: string;
  platformDescription: string;
  pillars: { title: string; description: string }[];
  accessEyebrow: string;
  accessHeading: string;
  accessDescription: string;
  workspaceLabel: string;
  diagramNodes: string[];
  copyright: string;
  features: { title: string; description: string }[];
}> = {
  fr: {
    productTitle: 'Système intelligent de gestion des ressources humaines',
    headline: 'Gérez vos talents, transformez votre entreprise.',
    description: 'Une plateforme intelligente et sécurisée pour centraliser, automatiser et simplifier la gestion de vos ressources humaines.',
    login: 'Se connecter',
    homeLabel: 'Accueil +HR',
    navigationLabel: 'Navigation principale',
    languageLabel: 'Langue',
    discover: 'Découvrir +HR',
    featuresNav: 'Fonctionnalités',
    platformNav: 'La plateforme',
    featureEyebrow: 'La gestion RH, enfin réunie',
    featureHeading: 'Tout votre quotidien RH dans un seul espace.',
    featureDescription: '+HR rassemble les outils dont vos équipes ont besoin pour gérer les personnes, le temps, les opérations et la communication.',
    platformEyebrow: 'Une plateforme, plusieurs perspectives',
    platformHeading: 'Une organisation plus claire, à chaque étape.',
    platformDescription: 'Des informations accessibles selon les rôles, des opérations connectées et des outils qui accompagnent les équipes au fil de leur journée.',
    pillars: [
      { title: 'Centraliser', description: 'Retrouvez les dossiers et opérations RH dans un espace cohérent.' },
      { title: 'Coordonner', description: 'Reliez les équipes, les plannings, les demandes et les échanges.' },
      { title: 'Piloter', description: 'Suivez les indicateurs et rapports adaptés à vos autorisations.' },
    ],
    accessEyebrow: 'Votre espace RH commence ici',
    accessHeading: 'Gérez vos talents avec +HR.',
    accessDescription: 'Connectez-vous à votre espace de travail pour retrouver les outils de votre organisation.',
    workspaceLabel: 'Espace de travail +HR',
    diagramNodes: ['Personnel', 'Temps et activités', 'Paie et contrats', 'Assistant IA'],
    copyright: 'Système intelligent de gestion des ressources humaines.',
    features: [
      { title: 'Gestion Multi-Entreprises', description: 'Gérez plusieurs entreprises et leurs espaces avec des accès adaptés.' },
      { title: 'Gestion des employés', description: 'Consultez les profils, dossiers et informations du personnel.' },
      { title: 'Présences et pointage', description: 'Suivez les présences, les horaires et les pointages.' },
      { title: 'Congés et autorisations de sortie', description: 'Soumettez et suivez les demandes et leurs validations.' },
      { title: 'Salaires et contrats', description: 'Retrouvez les outils de paie, les contrats et les documents associés.' },
      { title: 'Horaires et plannings', description: 'Organisez les horaires et les plannings des équipes.' },
      { title: 'Intelligence artificielle Gemini', description: 'Accédez à l’assistant RH propulsé par Gemini.' },
      { title: 'Communication en temps réel', description: 'Échangez avec les équipes et recevez les notifications.' },
      { title: 'Rapports et statistiques', description: 'Consultez les rapports et indicateurs disponibles pour votre rôle.' },
      { title: 'Sécurité et sauvegarde des données', description: 'Utilisez des accès par rôle et des outils de sauvegarde intégrés.' },
    ],
  },
  en: {
    productTitle: 'Intelligent Human Resources Management System',
    headline: 'Manage your talent, transform your business.',
    description: 'An intelligent, secure platform to centralize, automate, and simplify human resources management.',
    login: 'Sign in',
    homeLabel: '+HR home',
    navigationLabel: 'Main navigation',
    languageLabel: 'Language',
    discover: 'Discover +HR',
    featuresNav: 'Features',
    platformNav: 'Platform',
    featureEyebrow: 'HR, working together',
    featureHeading: 'Your everyday people operations, in one place.',
    featureDescription: '+HR brings together the tools your teams need to manage people, time, operations, and communication.',
    platformEyebrow: 'One platform, many perspectives',
    platformHeading: 'A clearer view of your organization, at every step.',
    platformDescription: 'Role-aware information, connected operations, and tools that support teams throughout their day.',
    pillars: [
      { title: 'Centralize', description: 'Bring employee records and HR operations into one coherent workspace.' },
      { title: 'Coordinate', description: 'Connect teams, schedules, requests, and conversations.' },
      { title: 'Manage', description: 'Review the reports and indicators available to your role.' },
    ],
    accessEyebrow: 'Your HR workspace starts here',
    accessHeading: 'Manage your talent with +HR.',
    accessDescription: 'Sign in to your workspace and access the tools for your organization.',
    workspaceLabel: '+HR workspace',
    diagramNodes: ['People', 'Time & activities', 'Payroll & contracts', 'AI assistant'],
    copyright: 'Intelligent Human Resources Management System.',
    features: [
      { title: 'Multi-company management', description: 'Manage multiple companies and their workspaces with role-aware access.' },
      { title: 'Employee management', description: 'Access employee profiles, records, and personnel information.' },
      { title: 'Attendance & time tracking', description: 'Follow attendance, schedules, and time clock records.' },
      { title: 'Leave & exit permissions', description: 'Submit and track requests and their approvals.' },
      { title: 'Payroll & contracts', description: 'Access payroll tools, contracts, and related documents.' },
      { title: 'Schedules & planning', description: 'Organize team schedules and shifts.' },
      { title: 'Gemini artificial intelligence', description: 'Access the Gemini-powered HR assistant.' },
      { title: 'Real-time communication', description: 'Connect with teams and receive notifications.' },
      { title: 'Reports & analytics', description: 'Review reports and indicators available to your role.' },
      { title: 'Data security & backups', description: 'Use role-based access and integrated backup tools.' },
    ],
  },
  ar: {
    productTitle: 'نظام ذكي لإدارة الموارد البشرية',
    headline: 'أدر مواهبك، وطوّر مؤسستك.',
    description: 'منصة ذكية وآمنة لتجميع إدارة الموارد البشرية وأتمتتها وتبسيطها.',
    login: 'تسجيل الدخول',
    homeLabel: 'الرئيسية +HR',
    navigationLabel: 'التنقل الرئيسي',
    languageLabel: 'اللغة',
    discover: 'اكتشف +HR',
    featuresNav: 'الميزات',
    platformNav: 'المنصة',
    featureEyebrow: 'إدارة الموارد البشرية في مكان واحد',
    featureHeading: 'كل عمليات الموارد البشرية اليومية في مساحة واحدة.',
    featureDescription: 'تجمع +HR الأدوات التي تحتاجها فرقك لإدارة الأفراد والوقت والعمليات والتواصل.',
    platformEyebrow: 'منصة واحدة ورؤى متعددة',
    platformHeading: 'رؤية أوضح لمؤسستك في كل خطوة.',
    platformDescription: 'معلومات حسب الصلاحيات وعمليات مترابطة وأدوات تدعم الفرق طوال يوم العمل.',
    pillars: [
      { title: 'التجميع', description: 'اجمع ملفات الموظفين وعمليات الموارد البشرية في مساحة متناسقة.' },
      { title: 'التنسيق', description: 'اربط الفرق والجداول والطلبات والمحادثات.' },
      { title: 'الإدارة', description: 'راجع التقارير والمؤشرات المتاحة وفق دورك.' },
    ],
    accessEyebrow: 'مساحة الموارد البشرية تبدأ هنا',
    accessHeading: 'أدر مواهبك مع +HR.',
    accessDescription: 'سجّل الدخول إلى مساحة عملك للوصول إلى أدوات مؤسستك.',
    workspaceLabel: 'مساحة عمل +HR',
    diagramNodes: ['الموظفون', 'الوقت والأنشطة', 'الرواتب والعقود', 'المساعد الذكي'],
    copyright: 'نظام ذكي لإدارة الموارد البشرية.',
    features: [
      { title: 'إدارة شركات متعددة', description: 'أدر عدة شركات ومساحاتها مع صلاحيات ملائمة للأدوار.' },
      { title: 'إدارة الموظفين', description: 'اطلع على ملفات الموظفين وسجلاتهم ومعلوماتهم.' },
      { title: 'الحضور وتسجيل الوقت', description: 'تابع الحضور والجداول وسجلات تسجيل الوقت.' },
      { title: 'الإجازات وأذونات الخروج', description: 'قدّم الطلبات وتابعها وموافقاتها.' },
      { title: 'الرواتب والعقود', description: 'استخدم أدوات الرواتب والعقود والوثائق المرتبطة بها.' },
      { title: 'الجداول والتخطيط', description: 'نظّم جداول الفرق ومواعيدها.' },
      { title: 'الذكاء الاصطناعي Gemini', description: 'استخدم مساعد الموارد البشرية المدعوم من Gemini.' },
      { title: 'التواصل الفوري', description: 'تواصل مع الفرق واستقبل الإشعارات.' },
      { title: 'التقارير والإحصاءات', description: 'راجع التقارير والمؤشرات المتاحة وفق دورك.' },
      { title: 'أمان البيانات والنسخ الاحتياطي', description: 'استخدم صلاحيات مبنية على الأدوار وأدوات النسخ الاحتياطي.' },
    ],
  },
};
