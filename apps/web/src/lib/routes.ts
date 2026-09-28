export const projectHref = (
  projectID: string,
  section?: string,
  resourceID?: string,
) => {
  const base = `/projects/${projectID}`;
  if (!section) return base;
  return `${base}/${section}${resourceID ? `/${resourceID}` : ""}`;
};
