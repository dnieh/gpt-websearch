import { convert } from "html-to-text";
import pdf from "pdf-parse/lib/pdf-parse.js";
import fs from "fs";
import { PlaywrightWebBaseLoader } from "langchain/document_loaders/web/playwright";

const extractTextFromUrl = async (url, debug) => {
  const response = await fetch(url);
  const contentType = response.headers.get("content-type");

  debug && console.log("contentType:", contentType);

  if (contentType.includes("html")) {
    return extractTextFromHtml(response, url, debug);
  } else if (contentType.includes("pdf")) {
    return extractTextFromPdf(response, debug);
  }

  // TODO: alerting
  return "";
};

const extractTextFromHtml = async (response, url, debug) => {
  const html = await response.text();
  const text = convert(html);

  debug && console.log("text length:", text.length);

  if (text.length === 0) {
    return extractTextFromJsHtml(url, debug);
  }

  return text;
};

const extractTextFromJsHtml = async (url, debug) => {
  const DELAY = 5000;

  const loader = new PlaywrightWebBaseLoader(url, {
    launchOptions: { headless: true },
    gotoOptions: { waitUntil: "domcontentloaded" },
    async evaluate(page, browser, response) {
      await delay(DELAY);
      const result = await page.evaluate(() => document.body.innerHTML);
      return result;
    },
  });

  const docs = await loader.load();
  const html = docs[0].pageContent;
  const text = convert(html);

  debug && console.log("attempted to extract text from a js html page");
  debug && console.log("text length:", text.length);

  return text;
};

const extractTextFromPdf = async (response, debug) => {
  const pdfBuffer = await response.arrayBuffer();
  const binaryPdf = Buffer.from(pdfBuffer);
  const tempFilename = "temp.pdf";
  fs.writeFileSync(tempFilename, binaryPdf, "binary");
  const dataBuffer = fs.readFileSync(tempFilename);

  let text = "";
  try {
    const data = await pdf(dataBuffer);
    text = data.text;
    debug && console.log("text length:", text.length);

    if (text.length === 0) {
      // TODO: alerting
    }
  } catch (e) {
    console.log(e);
  }

  fs.unlink(tempFilename, (err) => {
    if (err) throw err;
  });

  return text;
};

const delay = async (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export { extractTextFromUrl, extractTextFromJsHtml };
