/**
 * 浏览器端文档文字提取。
 *
 * 后端迁到 Cloudflare Workers 后，免费版是 10ms CPU/次调用，而 PDF 解析是纯计算，
 * 放服务端必被掐断（LLM 调用能跑很久是因为等待 I/O 不计 CPU，两者不是一回事）。
 * 原版则是把二进制直接丢给 Gemini 多模态解析，那会把功能焊死在单一供应商上。
 *
 * 所以提取放在浏览器：Worker 零 CPU 消耗，也不锁供应商，
 * 提取出的纯文本走已有的书卷生成链路。
 */

const PDF_LIB = '/frontend/vendor/pdf.min.mjs';
const PDF_WORKER = '/frontend/vendor/pdf.worker.min.mjs';
const FFLATE = '/frontend/vendor/fflate.min.mjs';

/** 生成书卷只需要梗概，不需要全文；超出则头尾采样。 */
const MAX_CHARS = 80000;
/** 低于这个字数就认为没提取到有效内容（多半是扫描件） */
const MIN_USEFUL_CHARS = 200;

export class ExtractError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'ExtractError';
    this.code = code;
  }
}

let pdfjsPromise = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import(PDF_LIB).then((mod) => {
      // 不设 workerSrc 的话 pdf.js 会在主线程解析，大文件会把页面卡死
      mod.GlobalWorkerOptions.workerSrc = PDF_WORKER;
      return mod;
    });
  }
  return pdfjsPromise;
}

/**
 * 超长文本的截断：保留开头为主，尾部补一段。
 * 小说类文档开头交代设定、结尾交代结局，中间大量情节对生成世界观帮助有限。
 */
function truncate(text) {
  if (text.length <= MAX_CHARS) return { text, truncated: false };
  const headLen = Math.floor(MAX_CHARS * 0.7);
  const tailLen = MAX_CHARS - headLen;
  const head = text.slice(0, headLen);
  const tail = text.slice(-tailLen);
  return { text: `${head}\n\n……（中间内容已省略）……\n\n${tail}`, truncated: true };
}

/**
 * 修正 PDF 常见的“同形字”问题。
 *
 * 部分 PDF 的字体子集会把汉字映射到 Unicode 的**康熙部首区**（U+2F00–U+2FDF）
 * 或 CJK 部首补充区（U+2E80–U+2EFF）。它们和正常汉字长得一模一样但码位不同：
 * 「北⽅」里的⽅是 U+2F45，而不是 U+65B9 的方。实测本项目用 Chrome 打印出的
 * PDF 就有这个问题，后果是人名匹配失败、模型收到一堆异形字。
 *
 * NFKC 规范化正好能把它们映射回标准汉字。但只对这两个区段逐字处理——
 * 整段 NFKC 会把中文全角标点「，。」转成 ASCII 逗号句号，破坏中文排版。
 */
// CJK 部首补充区里 NFKC 不处理、但确实会在正文中出现的字符。
// 例如「衙门」的门被映射成 U+2ED4（⻔），肉眼看不出差别但字符串匹配全失效。
const RADICAL_SRC = '⺖⺘⺡⺣⺨⺯⺰⺼⺾⺿⻀⻄⻅⻆⻈⻉⻋⻌⻍⻎⻐⻓⻔⻙⻚⻛⻜⻠⻢⻥⻦⻧⻨⻩⻪⻬⻮⻰⻳';
const RADICAL_DST = '忄扌氵灬犭糹纟月艹艹艹西见角讠贝车辶辶辶钅长门韦页风飞饣马鱼鸟卤麦黄黾齐齿龙龟';

function fixLookalikeCJK(text) {
  return text.replace(/[\u2E80-\u2EFF\u2F00-\u2FDF]/g, (ch) => {
    // 康熙部首区（U+2F00–U+2FDF）有规范分解，NFKC 直接搞定
    const nfkc = ch.normalize('NFKC');
    if (nfkc !== ch) return nfkc;
    // 部首补充区（U+2E80–U+2EFF）没有，查表
    const i = RADICAL_SRC.indexOf(ch);
    return i === -1 ? ch : RADICAL_DST[i];
  });
}

function normalize(text) {
  return fixLookalikeCJK(text)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------- PDF ----------

async function extractPdf(file) {
  const pdfjs = await loadPdfjs();
  const buffer = await file.arrayBuffer();

  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  } catch (err) {
    throw new ExtractError(`PDF 无法解析：${err.message}`, 'pdf_parse_failed');
  }

  const parts = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // pdf.js 把一行拆成多个 item，hasEOL 标记行尾
    let line = '';
    for (const item of content.items) {
      if (typeof item.str !== 'string') continue;
      line += item.str;
      if (item.hasEOL) {
        parts.push(line);
        line = '';
      }
    }
    if (line) parts.push(line);

    // 已经够生成用了就提前收工，避免长文档白等
    if (parts.join('\n').length > MAX_CHARS * 1.5) break;
  }
  await doc.destroy();

  return { text: normalize(parts.join('\n')), pages: doc.numPages };
}

// ---------- DOCX ----------

/**
 * DOCX 本质是个 ZIP，正文在 word/document.xml。
 * 这里只取文字节点，不还原样式——生成书卷用不到排版。
 */
async function extractDocx(file) {
  const { unzipSync, strFromU8 } = await import(FFLATE);
  const buffer = new Uint8Array(await file.arrayBuffer());

  let files;
  try {
    files = unzipSync(buffer);
  } catch (err) {
    throw new ExtractError(`DOCX 无法解压：${err.message}`, 'docx_unzip_failed');
  }

  const entry = files['word/document.xml'];
  if (!entry) {
    throw new ExtractError('这个文件不像有效的 DOCX（缺少 word/document.xml）', 'docx_invalid');
  }

  const xml = strFromU8(entry);
  const paragraphs = [];
  // <w:p> 是段落，<w:t> 是文字节点；<w:br/> 与 <w:tab/> 视作空白
  for (const pMatch of xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)) {
    const block = pMatch[0];
    let line = '';
    for (const tMatch of block.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)) {
      line += tMatch[1];
    }
    line = line
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
    if (line.trim()) paragraphs.push(line.trim());
  }

  return { text: normalize(paragraphs.join('\n')), pages: null };
}

// ---------- 旧版 .doc ----------

/**
 * 二进制 .doc（Word 97-2003）是 OLE 复合文档，浏览器端可靠解析成本很高。
 * 与其做一个半吊子实现让用户拿到乱码，不如明确拒绝并给出可操作的指引。
 */
function rejectLegacyDoc() {
  throw new ExtractError(
    '旧版 .doc 格式暂不支持。请在 Word 里另存为 .docx，或导出为 PDF 后重试。',
    'legacy_doc',
  );
}

// ---------- 入口 ----------

/**
 * 从文件中提取纯文本。
 *
 * @param {File} file
 * @returns {Promise<{ text: string, kind: string, pages: number|null, truncated: boolean }>}
 */
export async function extractText(file) {
  if (!file) throw new ExtractError('没有选择文件', 'no_file');

  const name = (file.name || '').toLowerCase();
  let result;
  let kind;

  if (name.endsWith('.pdf')) {
    kind = 'pdf';
    result = await extractPdf(file);
  } else if (name.endsWith('.docx')) {
    kind = 'docx';
    result = await extractDocx(file);
  } else if (name.endsWith('.doc')) {
    rejectLegacyDoc();
  } else if (name.endsWith('.txt') || name.endsWith('.md')) {
    kind = 'txt';
    result = { text: normalize(await file.text()), pages: null };
  } else {
    throw new ExtractError(`不支持的文件类型：${file.name}`, 'unsupported');
  }

  if (result.text.length < MIN_USEFUL_CHARS) {
    // 扫描版 PDF 只有图像层，提取不到文字。与其把空文本喂给模型让它胡编，
    // 不如直说，并指一条能走通的路。
    const hint =
      kind === 'pdf'
        ? '这份 PDF 似乎是扫描件（没有文字层），无法提取内容。请改用文字版 PDF，或直接使用「根据描述生成书卷」。'
        : '文件内容太少，无法用于生成书卷。';
    throw new ExtractError(hint, 'too_short');
  }

  const { text, truncated } = truncate(result.text);
  return { text, kind, pages: result.pages, truncated };
}
