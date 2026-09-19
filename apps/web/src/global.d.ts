import type { routing } from "@/i18n/routing";
import type messages from "../messages/en.json";

// Makes message keys type-checked against en.json, so a missing or misspelled
// key is a build error rather than a literal "auth.signIn.titel" rendered on
// screen. en.json is the reference: a key added there without its es.json
// counterpart is an incomplete change, which the i18n rules already say.
declare module "next-intl" {
  interface AppConfig {
    Messages: typeof messages;
    Locale: (typeof routing.locales)[number];
  }
}
