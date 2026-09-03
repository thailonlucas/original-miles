import { renderCustomerTypeCategoryDescriptions } from '../category-descriptions';

export function buildSystemPrompt(): string {
  return `Classify the user role on the conversation into one of the following categories. Don't explain, only output the json.
  ${renderCustomerTypeCategoryDescriptions()}`;
}
