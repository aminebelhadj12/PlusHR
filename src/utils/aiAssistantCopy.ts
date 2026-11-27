import type { AppLang, RoleCode } from '../types';

export const assistantCopy = {
  "fr": {
    "title": "Assistant RH +HR",
    "history": "Conversations",
    "newChat": "Nouvelle conversation",
    "search": "Rechercher une conversation",
    "empty": "Aucune conversation.",
    "noResults": "Aucun résultat.",
    "rename": "Renommer",
    "delete": "Supprimer",
    "cancel": "Annuler",
    "save": "Enregistrer",
    "deletePrompt": "Supprimer cette conversation et ses messages ?",
    "welcome": "Comment puis-je vous aider ?",
    "intro": "Posez une question sur vos données RH autorisées.",
    "input": "Posez votre question RH…",
    "send": "Envoyer",
    "thinking": "Préparation de la réponse…",
    "streaming": "Réponse en cours…",
    "copy": "Copier la réponse",
    "copied": "Réponse copiée",
    "copyError": "Impossible de copier la réponse.",
    "error": "Une erreur est survenue. Réessayez.",
    "loading": "Chargement…",
    "archived": "Cette conversation est archivée. Ouvrez une nouvelle conversation pour obtenir une réponse dans votre périmètre actuel.",
    "privacy": "Les réponses sont limitées aux données autorisées pour votre rôle.",
    "local": "Réponse locale"
  },
  "en": {
    "title": "+HR Assistant",
    "history": "Conversations",
    "newChat": "New conversation",
    "search": "Search conversations",
    "empty": "No conversations yet.",
    "noResults": "No results.",
    "rename": "Rename",
    "delete": "Delete",
    "cancel": "Cancel",
    "save": "Save",
    "deletePrompt": "Delete this conversation and its messages?",
    "welcome": "How can I help?",
    "intro": "Ask about HR data you’re authorized to access.",
    "input": "Ask an HR question…",
    "send": "Send",
    "thinking": "Preparing a response…",
    "streaming": "Responding…",
    "copy": "Copy response",
    "copied": "Response copied",
    "copyError": "Couldn’t copy the response.",
    "error": "Something went wrong. Try again.",
    "loading": "Loading…",
    "archived": "This conversation is archived. Start a new conversation within your current permissions.",
    "privacy": "Responses are limited to data available to your role.",
    "local": "Local response"
  },
  "ar": {
    "title": "مساعد الموارد البشرية +HR",
    "history": "المحادثات",
    "newChat": "محادثة جديدة",
    "search": "ابحث في المحادثات",
    "empty": "لا توجد محادثات بعد.",
    "noResults": "لا توجد نتائج.",
    "rename": "إعادة التسمية",
    "delete": "حذف",
    "cancel": "إلغاء",
    "save": "حفظ",
    "deletePrompt": "هل تريد حذف هذه المحادثة ورسائلها؟",
    "welcome": "كيف يمكنني مساعدتك؟",
    "intro": "اطرح سؤالًا عن بيانات الموارد البشرية المصرّح لك بالوصول إليها.",
    "input": "اطرح سؤالك عن الموارد البشرية…",
    "send": "إرسال",
    "thinking": "جارٍ إعداد الرد…",
    "streaming": "جارٍ كتابة الرد…",
    "copy": "نسخ الرد",
    "copied": "تم نسخ الرد",
    "copyError": "تعذّر نسخ الرد.",
    "error": "حدث خطأ. حاول مجددًا.",
    "loading": "جارٍ التحميل…",
    "archived": "هذه المحادثة مؤرشفة. ابدأ محادثة جديدة للحصول على إجابات ضمن صلاحياتك الحالية.",
    "privacy": "تقتصر الإجابات على البيانات المتاحة لدورك.",
    "local": "إجابة محلية"
  }
};

const suggestions: Record<RoleCode, Array<[string, string, string]>> = {
  "SUPER_ADMIN": [
    [
      "Combien d’entreprises sont actives ?",
      "How many companies are active?",
      "كم عدد الشركات النشطة؟"
    ],
    [
      "Combien d’incidents techniques sont ouverts ?",
      "How many technical incidents are open?",
      "كم عدد الحوادث التقنية المفتوحة؟"
    ]
  ],
  "COMPANY_ADMIN": [
    [
      "Quel est le bilan des présences aujourd’hui ?",
      "What is today’s attendance summary?",
      "ما ملخص الحضور اليوم؟"
    ],
    [
      "Quels départements risquent une surcharge ?",
      "Which departments are at risk of overload?",
      "ما الأقسام المعرّضة لعبء عمل زائد؟"
    ]
  ],
  "HR_MANAGER": [
    [
      "Quels contrats expirent dans les 30 prochains jours ?",
      "Which contracts expire in the next 30 days?",
      "ما العقود التي تنتهي خلال الثلاثين يومًا المقبلة؟"
    ],
    [
      "Combien de demandes de congés sont en attente ?",
      "How many leave requests are pending?",
      "كم عدد طلبات الإجازة المعلّقة؟"
    ]
  ],
  "MANAGER": [
    [
      "Quelle est la charge de travail de mon département ?",
      "What is my department’s workload?",
      "ما حجم العمل في قسمي؟"
    ],
    [
      "Combien de demandes de congés sont en attente dans mon équipe ?",
      "How many leave requests are pending in my team?",
      "كم عدد طلبات الإجازة المعلّقة في فريقي؟"
    ]
  ],
  "EMPLOYEE": [
    [
      "Quel est mon solde de congés ?",
      "What is my remaining leave balance?",
      "ما رصيد إجازاتي المتبقي؟"
    ],
    [
      "Quels sont mes prochains horaires ?",
      "What are my upcoming shifts?",
      "ما مواعيد دوامي المقبلة؟"
    ],
    [
      "Quelles tâches me sont assignées ?",
      "What tasks are assigned to me?",
      "ما المهام الموكلة إليّ؟"
    ]
  ]
};

const languageIndex = { fr: 0, en: 1, ar: 2 };

export function assistantSuggestions(role: RoleCode | undefined, lang: AppLang): string[] {
  return role ? suggestions[role].map((prompt) => prompt[languageIndex[lang]]) : [];
}
