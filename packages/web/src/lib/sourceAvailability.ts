const REPO_URL = 'https://github.com/arthurwang110505-debug/echora';

export const getCorrespondingSourceUrl = () => {
  const sha = (import.meta.env.VITE_GIT_COMMIT_SHA as string | undefined)?.trim();
  return sha ? `${REPO_URL}/tree/${sha}` : REPO_URL;
};
