import { config, getJson } from "serpapi";
import { extractTextFromUrl } from "./utils.js";
import { ChatOpenAI } from "langchain/chat_models/openai";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { SystemMessagePromptTemplate, HumanMessagePromptTemplate, ChatPromptTemplate } from "langchain/prompts";
import { StringOutputParser } from "langchain/schema/output_parser";
import { RunnableSequence, RunnablePassthrough } from "langchain/schema/runnable";
import { formatDocumentsAsString } from "langchain/util/document";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { HNSWLib } from "langchain/vectorstores/hnswlib";

// Config
const QUERY = "tokyo new year's eve party";
const SHOW_LOGS = true;
const SEARCH_ENGINE = "google";
const MAX_WEB_RESULTS = 1;
const TEXT_SPLIT_CHUNK_SIZE = 1000;
const GPT_MODEL = "gpt-4-1106-preview";
const MODEL_TEMP = 0.2;
process.env.LANGCHAIN_VERBOSE = false;
config.api_key = process.env.SERP_API_KEY;
config.timeout = 20000;

// Get the top web results
const webResults = await getJson({
  engine: SEARCH_ENGINE,
  q: QUERY,
});
const results = webResults.organic_results
  .map((result) => ({ link: result.link, title: result.title }))
  .slice(0, MAX_WEB_RESULTS);

SHOW_LOGS && console.log("query:", QUERY);
SHOW_LOGS && console.log("results:", results);

// Extract text from the web results and feed to model
const docs = [];
for (const result of results) {
  SHOW_LOGS && console.log("extracting text from:", result.link);
  const text = await extractTextFromUrl(result.link, SHOW_LOGS);

  if (text.length) {
    const textSplitter = new RecursiveCharacterTextSplitter({ TEXT_SPLIT_CHUNK_SIZE: 1000 });
    const tempDocs = await textSplitter.createDocuments([text]);
    docs.push(...tempDocs);
  }
}

let totalCompletionTokens = 0;
let totalPromptTokens = 0;
let totalExecutionTokens = 0;

const model = new ChatOpenAI({
  openAIApiKey: process.env.OPENAI_API_KEY,
  modelName: GPT_MODEL,
  temperature: MODEL_TEMP,
  callbacks: [
    {
      handleLLMEnd: (output) => {
        const { completionTokens, promptTokens, totalTokens } = output.llmOutput?.tokenUsage;
        totalCompletionTokens += completionTokens ?? 0;
        totalPromptTokens += promptTokens ?? 0;
        totalExecutionTokens += totalTokens ?? 0;
      },
    },
  ],
});

const vectorStore = await HNSWLib.fromDocuments(docs, new OpenAIEmbeddings());
const SYSTEM_TEMPLATE = `Use the following context to answer the question at the end. If you don't know the answer just say that you don't know. Don't try to make up an answer.
-----------------------
{context}`;
const messages = [
  SystemMessagePromptTemplate.fromTemplate(SYSTEM_TEMPLATE),
  HumanMessagePromptTemplate.fromTemplate("{question}"),
];
const prompt = ChatPromptTemplate.fromMessages(messages);
const chain = RunnableSequence.from([
  {
    context: vectorStore.asRetriever().pipe(formatDocumentsAsString),
    question: new RunnablePassthrough(),
  },
  prompt,
  model,
  new StringOutputParser(),
]);

// Invoke the model
const answer = await chain.invoke("What are some good options for New Year's Eve parties in Tokyo?");
console.log(answer);

SHOW_LOGS && console.log("totalCompletionTokens:", totalCompletionTokens);
SHOW_LOGS && console.log("totalPromptTokens:", totalPromptTokens);
SHOW_LOGS && console.log("totalExecutionTokens:", totalExecutionTokens);
