import type { AppLang } from '../types';

type LandingFeature = { title: string; description: string };
type LandingCopy = {
  navigationLabel: string;
  languageLabel: string;
  homeLabel: string;
  home: string;
  featuresNav: string;
  howNav: string;
  securityNav: string;
  login: string;
  workspace: string;
  discover: string;
  heroEyebrow: string;
  headlineBefore: string;
  headlineAccent: string;
  headlineAfter: string;
  description: string;
  benefits: string[];
  rolesLabel: string;
  rolesTitle: string;
  roles: string[];
  modulesLabel: string;
  modules: string[];
  featuresEyebrow: string;
  featuresHeading: string;
  featuresDescription: string;
  features: LandingFeature[];
  workflowEyebrow: string;
  workflowHeading: string;
  workflowDescription: string;
  workflowSteps: LandingFeature[];
  securityEyebrow: string;
  securityHeading: string;
  securityDescription: string;
  securityPoints: string[];
  ctaHeading: string;
  ctaDescription: string;
  copyright: string;
};

export const landingCopy: Record<AppLang, LandingCopy> = {
  fr: {
    navigationLabel: 'Navigation principale',
    languageLabel: 'Langue',
    homeLabel: 'Accueil +HR',
    home: 'Accueil',
    featuresNav: 'Fonctionnalités',
    howNav: 'Comment ça marche',
    securityNav: 'Sécurité',
    login: 'Se connecter',
    workspace: 'Accéder à mon espace',
    discover: 'Découvrir +HR',
    heroEyebrow: 'Votre partenaire RH intelligent',
    headlineBefore: 'Simplifiez vos RH, valorisez vos ',
    headlineAccent: 'talents',
    headlineAfter: '.',
    description: "+HR centralise la gestion de vos collaborateurs, automatise vos processus RH et vous accompagne dans vos décisions grâce à l'intelligence artificielle.",
    benefits: [
      'Gérez vos collaborateurs en toute simplicité.',
      'Centralisez vos données RH en toute sécurité.',
      "Prenez des décisions grâce à l'intelligence artificielle.",
    ],
    rolesLabel: 'Un espace adapté à chaque responsabilité',
    rolesTitle: 'Cinq rôles, une même équipe.',
    roles: ['Administrateur plateforme', 'Administrateur entreprise', 'Responsable RH', 'Manager', 'Employé'],
    modulesLabel: 'Un quotidien RH mieux organisé',
    modules: ['Employés', 'Présences', 'Congés', 'Contrats', 'Salaires', 'Planning', 'Intelligence artificielle', 'Rapports'],
    featuresEyebrow: 'Les outils essentiels, réunis',
    featuresHeading: 'Toutes vos opérations RH au même endroit.',
    featuresDescription: '+HR accompagne les équipes à travers leurs tâches quotidiennes, avec des fonctionnalités accessibles selon leurs autorisations.',
    features: [
      { title: 'Gestion Multi-Entreprises', description: 'Administrez plusieurs entreprises dans des espaces distincts.' },
      { title: 'Gestion des employés', description: 'Consultez et gérez les dossiers de vos collaborateurs.' },
      { title: 'Présences et pointage', description: 'Suivez les présences et les pointages.' },
      { title: 'Congés et autorisations de sortie', description: 'Déposez des demandes et suivez leur validation.' },
      { title: 'Salaires et contrats', description: 'Retrouvez les informations de paie et les documents contractuels.' },
      { title: 'Horaires et plannings', description: 'Organisez les horaires et les plannings de vos équipes.' },
      { title: 'Intelligence artificielle Gemini', description: 'Bénéficiez de l’assistant RH propulsé par Gemini.' },
      { title: 'Communication en temps réel', description: 'Restez en contact avec vos équipes et leurs actualités.' },
      { title: 'Rapports et statistiques', description: 'Consultez les rapports disponibles selon votre rôle.' },
      { title: 'Sécurité et sauvegarde des données', description: 'Appuyez-vous sur les accès par rôle et les outils de sauvegarde intégrés.' },
    ],
    workflowEyebrow: 'Comment ça marche',
    workflowHeading: 'Une gestion RH claire, étape par étape.',
    workflowDescription: 'Les outils +HR accompagnent votre organisation de sa configuration au pilotage quotidien.',
    workflowSteps: [
      { title: 'Configuration de votre entreprise', description: 'Organisez votre espace et définissez les accès de votre organisation.' },
      { title: 'Gestion de vos collaborateurs', description: 'Centralisez les dossiers, les demandes, les présences et les plannings.' },
      { title: 'Pilotage intelligent des ressources humaines', description: 'Consultez les rapports et utilisez les outils d’aide à la décision disponibles.' },
    ],
    securityEyebrow: 'La sécurité au cœur de vos opérations',
    securityHeading: 'Vos données RH, avec des accès maîtrisés.',
    securityDescription: 'Les espaces multi-entreprises et les autorisations par rôle aident à préserver la séparation des données et à limiter l’accès aux informations selon les responsabilités.',
    securityPoints: ['Permissions selon les rôles', 'Espaces distincts par entreprise', 'Outils intégrés de sauvegarde'],
    ctaHeading: "L'avenir de vos ressources humaines commence ici.",
    ctaDescription: 'Une plateforme unique pour simplifier votre gestion RH au quotidien.',
    copyright: '© 2026 +HR. Tous droits réservés.',
  },
  en: {
    navigationLabel: 'Main navigation',
    languageLabel: 'Language',
    homeLabel: '+HR home',
    home: 'Home',
    featuresNav: 'Features',
    howNav: 'How it works',
    securityNav: 'Security',
    login: 'Sign in',
    workspace: 'Go to my workspace',
    discover: 'Discover +HR',
    heroEyebrow: 'Your intelligent HR partner',
    headlineBefore: 'Simplify HR, empower your ',
    headlineAccent: 'people',
    headlineAfter: '.',
    description: '+HR centralizes employee management, automates HR processes, and supports your decisions with artificial intelligence.',
    benefits: [
      'Manage your people with ease.',
      'Keep your HR information centralized and secure.',
      'Make decisions with the support of artificial intelligence.',
    ],
    rolesLabel: 'A workspace for every responsibility',
    rolesTitle: 'Five roles, one team.',
    roles: ['Platform administrator', 'Company administrator', 'HR manager', 'Manager', 'Employee'],
    modulesLabel: 'A more organized HR workday',
    modules: ['Employees', 'Attendance', 'Leave', 'Contracts', 'Payroll', 'Planning', 'Artificial intelligence', 'Reports'],
    featuresEyebrow: 'Essential tools, together',
    featuresHeading: 'Your HR operations, all in one place.',
    featuresDescription: '+HR supports teams in their everyday work, with features available according to their permissions.',
    features: [
      { title: 'Multi-company management', description: 'Administer multiple companies in separate workspaces.' },
      { title: 'Employee management', description: 'Review and manage employee records.' },
      { title: 'Attendance & time tracking', description: 'Keep track of attendance and clock-ins.' },
      { title: 'Leave & exit permissions', description: 'Submit requests and follow their approval.' },
      { title: 'Payroll & contracts', description: 'Find payroll information and contract documents.' },
      { title: 'Schedules & planning', description: 'Organize team schedules and shifts.' },
      { title: 'Gemini artificial intelligence', description: 'Use the Gemini-powered HR assistant.' },
      { title: 'Real-time communication', description: 'Stay connected with your teams and their updates.' },
      { title: 'Reports & analytics', description: 'Review reports available to your role.' },
      { title: 'Data security & backups', description: 'Use role-based access and integrated backup tools.' },
    ],
    workflowEyebrow: 'How it works',
    workflowHeading: 'Clear HR management, step by step.',
    workflowDescription: 'From initial setup to everyday operations, +HR brings your organization’s tools together.',
    workflowSteps: [
      { title: 'Configure your company', description: 'Set up your workspace and define access for your organization.' },
      { title: 'Manage your people', description: 'Centralize records, requests, attendance, and schedules.' },
      { title: 'Manage HR intelligently', description: 'Review reports and use the decision-support tools available to you.' },
    ],
    securityEyebrow: 'Security at the heart of your operations',
    securityHeading: 'HR information, with controlled access.',
    securityDescription: 'Multi-company workspaces and role-based permissions help separate company data and limit access according to responsibilities.',
    securityPoints: ['Role-based permissions', 'Separate company workspaces', 'Integrated backup tools'],
    ctaHeading: 'The future of your HR starts here.',
    ctaDescription: 'One platform to simplify your everyday HR management.',
    copyright: '© 2026 +HR. All rights reserved.',
  },
  ar: {
    navigationLabel: 'التنقل الرئيسي',
    languageLabel: 'اللغة',
    homeLabel: 'الرئيسية +HR',
    home: 'الرئيسية',
    featuresNav: 'الميزات',
    howNav: 'كيف تعمل المنصة',
    securityNav: 'الأمان',
    login: 'تسجيل الدخول',
    workspace: 'الدخول إلى مساحة العمل',
    discover: 'اكتشف +HR',
    heroEyebrow: 'شريكك الذكي للموارد البشرية',
    headlineBefore: 'بسّط إدارة الموارد البشرية وارتقِ بـ',
    headlineAccent: 'مواهبك',
    headlineAfter: '.',
    description: 'تجمع +HR إدارة الموظفين، وتؤتمت عمليات الموارد البشرية، وتدعم قراراتك بفضل الذكاء الاصطناعي.',
    benefits: [
      'أدر شؤون الموظفين بكل سهولة.',
      'اجمع بيانات الموارد البشرية وحافظ على أمانها.',
      'اتخذ قرارات مدعومة بالذكاء الاصطناعي.',
    ],
    rolesLabel: 'مساحة مناسبة لكل مسؤولية',
    rolesTitle: 'خمسة أدوار ضمن فريق واحد.',
    roles: ['مدير المنصة', 'مدير الشركة', 'مسؤول الموارد البشرية', 'مدير فريق', 'موظف'],
    modulesLabel: 'يوم عمل أكثر تنظيمًا',
    modules: ['الموظفون', 'الحضور', 'الإجازات', 'العقود', 'الرواتب', 'التخطيط', 'الذكاء الاصطناعي', 'التقارير'],
    featuresEyebrow: 'الأدوات الأساسية في مكان واحد',
    featuresHeading: 'عمليات الموارد البشرية في مساحة واحدة.',
    featuresDescription: 'تدعم +HR الفرق في مهامها اليومية، مع ميزات متاحة وفقًا للصلاحيات.',
    features: [
      { title: 'إدارة شركات متعددة', description: 'أدر شركات متعددة ضمن مساحات منفصلة.' },
      { title: 'إدارة الموظفين', description: 'اطلع على ملفات الموظفين وأدرها.' },
      { title: 'الحضور وتسجيل الوقت', description: 'تابع الحضور وسجلات تسجيل الوقت.' },
      { title: 'الإجازات وأذونات الخروج', description: 'قدّم الطلبات وتابع الموافقات.' },
      { title: 'الرواتب والعقود', description: 'اطلع على معلومات الرواتب ووثائق العقود.' },
      { title: 'الجداول والتخطيط', description: 'نظّم جداول الفرق ومواعيدها.' },
      { title: 'الذكاء الاصطناعي Gemini', description: 'استخدم مساعد الموارد البشرية المدعوم من Gemini.' },
      { title: 'التواصل الفوري', description: 'ابقَ على تواصل مع الفرق وآخر المستجدات.' },
      { title: 'التقارير والإحصاءات', description: 'راجع التقارير المتاحة وفق دورك.' },
      { title: 'أمان البيانات والنسخ الاحتياطي', description: 'استخدم صلاحيات مبنية على الأدوار وأدوات النسخ الاحتياطي.' },
    ],
    workflowEyebrow: 'كيف تعمل المنصة',
    workflowHeading: 'إدارة واضحة للموارد البشرية، خطوة بخطوة.',
    workflowDescription: 'تجمع +HR أدوات مؤسستك من الإعداد الأولي إلى إدارة العمليات اليومية.',
    workflowSteps: [
      { title: 'إعداد شركتك', description: 'أنشئ مساحة العمل وحدد صلاحيات مؤسستك.' },
      { title: 'إدارة الموظفين', description: 'اجمع الملفات والطلبات والحضور والجداول.' },
      { title: 'إدارة ذكية للموارد البشرية', description: 'راجع التقارير واستخدم أدوات دعم القرار المتاحة.' },
    ],
    securityEyebrow: 'الأمان في صميم عملياتك',
    securityHeading: 'بيانات الموارد البشرية بصلاحيات مضبوطة.',
    securityDescription: 'تساعد المساحات متعددة الشركات والصلاحيات حسب الدور على فصل البيانات وتحديد الوصول وفق المسؤوليات.',
    securityPoints: ['صلاحيات حسب الأدوار', 'مساحات منفصلة للشركات', 'أدوات نسخ احتياطي مدمجة'],
    ctaHeading: 'مستقبل مواردك البشرية يبدأ من هنا.',
    ctaDescription: 'منصة واحدة لتبسيط إدارة الموارد البشرية يوميًا.',
    copyright: '© 2026 +HR. جميع الحقوق محفوظة.',
  },
};
