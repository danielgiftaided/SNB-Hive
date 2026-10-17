export const DEFAULT_WHATSAPP_GROUP_URL = "https://chat.whatsapp.com/CmQhA1UBdh9G3t9VyDYF5K?s=hd&p=i&mlu=4&ilr=4&iam=2";

export function whatsappGroupUrl(input: string = DEFAULT_WHATSAPP_GROUP_URL) {
  return /^https:\/\/chat\.whatsapp\.com\/[a-zA-Z0-9]+(?:\?[^\s]*)?$/.test(input) ? input : "";
}
