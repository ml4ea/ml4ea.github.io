const personalEmailDomains = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'mail.com',
  'gmx.com',
  'gmx.net',
]);

export const usesPersonalEmailProvider = (email?: string) => {
  const domain = email?.trim().toLowerCase().split('@')[1];
  return Boolean(domain && personalEmailDomains.has(domain));
};

export const institutionalEmailMessage =
  'Instructor access requests require an institutional email address. Personal providers such as Gmail may be used for general portal participation, but not for protected teaching-resource requests. Institutional domains from all countries are accepted and do not need to end in .edu. Contact the portal administrator if your institution uses an unusual email arrangement.';
