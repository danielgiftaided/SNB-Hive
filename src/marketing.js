export const MARKETING_CONSENT_VERSION = "2026-10-17";
export const EMAIL_MARKETING_COPY = "Email me SNB Hive class news, events and special offers.";
export const WHATSAPP_MARKETING_COPY = "I would like to join the SNB Hive WhatsApp group for class news, events and offers.";
export const WHATSAPP_PRIVACY_COPY = "Your phone number will be visible to other group members. This does not include SMS or marketing calls.";

const configuredGroup = import.meta.env?.VITE_WHATSAPP_GROUP_URL || "https://chat.whatsapp.com/CmQhA1UBdh9G3t9VyDYF5K?s=hd&p=i&mlu=4&ilr=4&iam=2";
export const WHATSAPP_GROUP_URL = /^https:\/\/chat\.whatsapp\.com\/[a-zA-Z0-9]+(?:\?[^\s]*)?$/.test(configuredGroup) ? configuredGroup : "";

export function emailMarketingEligible(user) {
  return user?.marketingEmailOptIn === true && !!user.marketingEmailConfirmedAt;
}
