export type DiffPart = { type: "same" | "add" | "del"; text: string };

const MAX_TOKEN_PRODUCT = 4_000_000;

// Splits into words and the whitespace/punctuation between them, so concatenating
// all tokens exactly reproduces the input.
function tokenizeWords(text: string): string[] {
  return text.match(/[\p{L}\p{N}]+|[^\p{L}\p{N}]+/gu) ?? [];
}

function tokenizeLines(text: string): string[] {
  return text.match(/[^\n]*\n|[^\n]+/g) ?? [];
}

// Standard LCS-based diff over an arbitrary token array, merging adjacent same-type runs.
function diffTokens(before: string[], after: string[]): DiffPart[] {
  const n = before.length;
  const m = after.length;
  // dp[i][j] = length of LCS of before[i:], after[j:]
  const dp: Int32Array[] = new Array(n + 1);
  for (let i = 0; i <= n; i++) dp[i] = new Int32Array(m + 1);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        before[i] === after[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const parts: DiffPart[] = [];
  const push = (type: DiffPart["type"], text: string) => {
    if (text === "") return;
    const last = parts[parts.length - 1];
    if (last && last.type === type) {
      last.text += text;
    } else {
      parts.push({ type, text });
    }
  };

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      push("same", before[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push("del", before[i]);
      i++;
    } else {
      push("add", after[j]);
      j++;
    }
  }
  while (i < n) {
    push("del", before[i]);
    i++;
  }
  while (j < m) {
    push("add", after[j]);
    j++;
  }

  return parts;
}

export function wordDiff(before: string, after: string): DiffPart[] {
  const beforeWords = tokenizeWords(before);
  const afterWords = tokenizeWords(after);

  if (beforeWords.length * afterWords.length > MAX_TOKEN_PRODUCT) {
    // ponytail: O(n*m) LCS is too slow at this size; fall back to line-level diff which
    // has far fewer tokens. Upgrade to a Myers/patience diff if word-level granularity
    // is ever required for huge documents.
    return diffTokens(tokenizeLines(before), tokenizeLines(after));
  }

  return diffTokens(beforeWords, afterWords);
}
