import fs from 'fs';

const translations = {
  en: {
    postal_placeholder: "Enter Postal/Zip Code (e.g. M5V 3L9 or 90210)",
    footer_help: "Help",
    footer_privacy: "Privacy",
    footer_terms: "Terms"
  },
  zh: {
    postal_placeholder: "输入邮政编码 (例如 M5V 3L9 或 90210)",
    footer_help: "帮助",
    footer_privacy: "隐私",
    footer_terms: "条款"
  },
  es: {
    postal_placeholder: "Ingrese el código postal (ej. M5V 3L9 o 90210)",
    footer_help: "Ayuda",
    footer_privacy: "Privacidad",
    footer_terms: "Términos"
  },
  fr: {
    postal_placeholder: "Entrez le code postal (ex. M5V 3L9 ou 90210)",
    footer_help: "Aide",
    footer_privacy: "Confidentialité",
    footer_terms: "Conditions"
  },
  'fr-CA': {
    postal_placeholder: "Entrez le code postal (ex. M5V 3L9 ou 90210)",
    footer_help: "Aide",
    footer_privacy: "Confidentialité",
    footer_terms: "Conditions"
  },
  pt: {
    postal_placeholder: "Insira o código postal (ex. M5V 3L9 ou 90210)",
    footer_help: "Ajuda",
    footer_privacy: "Privacidade",
    footer_terms: "Termos"
  },
  hi: {
    postal_placeholder: "पिन/ज़िप कोड दर्ज करें (उदा. M5V 3L9 या 90210)",
    footer_help: "सहायता",
    footer_privacy: "गोपनीयता",
    footer_terms: "शर्तें"
  },
  ar: {
    postal_placeholder: "أدخل الرمز البريدي (مثل M5V 3L9 أو 90210)",
    footer_help: "مساعدة",
    footer_privacy: "الخصوصية",
    footer_terms: "الشروط"
  },
  pnb: {
    postal_placeholder: "پوسٹل/زپ کوڈ درج کرو (جیویں M5V 3L9 یا 90210)",
    footer_help: "مدد",
    footer_privacy: "پرائیویسی",
    footer_terms: "شرائط"
  }
};

let content = fs.readFileSync('src/i18n/config.ts', 'utf8');

for (const [lang, keys] of Object.entries(translations)) {
  const langKey = lang === 'fr-CA' ? "'fr-CA'" : lang;
  const regex = new RegExp(`(${langKey}:\\s*{\\s*translation:\\s*{[\\s\\S]*?)(}\\s*}\\s*(,|;))`);
  
  const match = content.match(regex);
  if (match) {
    const newKeys = Object.entries(keys).map(([k, v]) => `      ${k}: "${v}"`).join(',\n');
    content = content.replace(regex, `$1,\n${newKeys}\n    $2`);
  } else {
    console.log("Could not find", langKey);
  }
}

fs.writeFileSync('src/i18n/config.ts', content);
console.log("Done");
