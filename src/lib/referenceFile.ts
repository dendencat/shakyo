export const MAX_TEXT_REFERENCE_BYTES = 500_000

const TEXT_REFERENCE_TOO_LARGE_MESSAGE =
  'テキストファイルが大きすぎます。500 KB以下のファイルを選択してください。'

type TextReferenceFile = Pick<File, 'size' | 'text'>

export async function readTextReferenceFile(file: TextReferenceFile): Promise<string> {
  if (file.size > MAX_TEXT_REFERENCE_BYTES) {
    throw new Error(TEXT_REFERENCE_TOO_LARGE_MESSAGE)
  }

  return file.text()
}
