export function organizationLabel(name: string) {
  const normalized = name.trim();
  return /\sorganization$/i.test(normalized)
    ? normalized
    : `${normalized} Organization`;
}
