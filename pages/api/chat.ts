import type { NextApiRequest, NextApiResponse } from 'next';
import { OpenAIEmbeddings } from 'langchain/embeddings';
import { PineconeStore } from 'langchain/vectorstores';
import { makeChain } from '@/utils/makechain';
import { pinecone } from '@/utils/pinecone-client';
import { PINECONE_INDEX_NAME, PINECONE_NAME_SPACE } from '@/config/pinecone';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { question, history } = req.body;

  if (!question) {
    return res.status(400).json({ message: 'No question in the request' });
  }
  // OpenAI recommends replacing newlines with spaces for best results
  const sanitizedQuestion = question.trim().replaceAll('\n', ' ');

  const index = pinecone.Index(PINECONE_INDEX_NAME);

  /* create vectorstore*/
  const vectorStore = await PineconeStore.fromExistingIndex(
    new OpenAIEmbeddings({}),
    {
      pineconeIndex: index,
      textKey: 'text',
      namespace: PINECONE_NAME_SPACE,
    },
  );

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  const sendData = (data: string) => {
    res.write(`data: ${data}\n\n`);
  };

  sendData(JSON.stringify({ data: '' }));

  //create chain
  const chain = makeChain(vectorStore, (token: string) => {
    sendData(JSON.stringify({ data: token }));
  });
  try {
    //Ask a question
    const response = await chain.call({
      question: sanitizedQuestion,
      chat_history: history || [],
    });

    //console.log('response', response);
    console.log('sourceDocs:', response.sourceDocuments);
    const modifiedSourceDocs = response.sourceDocuments.map((doc: { pageContent: string; metadata: { pdf_numpages: any; source: string; }; }) => {
      const formattedPageContent = doc.pageContent
        .split('\n') // Split content by newlines
        .map((line: string) => line.trim()) // Remove leading/trailing whitespaces
        .filter((line: string | any[]) => line.length > 0) // Remove empty lines
        .join('\n'); // Join formatted lines with newlines
      
      const modifiedDoc = {
        pageContent: formattedPageContent,
        metadata: {
          pdf_numpages: doc.metadata.pdf_numpages,
          source: doc.metadata.source.replace('C:\\Users\\catch\\Desktop\\Freelancing\\gpt4-pdf-chatbot-langchain\\docs\\', '')
        }
      };
      return modifiedDoc;
    });
    
    sendData(JSON.stringify({ sourceDocs: modifiedSourceDocs }));
    
    sendData(JSON.stringify({ sourceDocs: modifiedSourceDocs }));
  } catch (error) {
    console.log('error', error);
  } finally {
    sendData('[DONE]');
    res.end();
  }
}
