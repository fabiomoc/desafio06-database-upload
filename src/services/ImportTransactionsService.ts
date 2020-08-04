import csvParse from 'csv-parse';
import fs from 'fs';
import Transaction from '../models/Transaction';

class ImportTransactionsService {
  async execute(filePath: string): Promise<Transaction[]> {
    const contactsReadStream = fs.createReadStream(filePath); // lendo os arquivos

    // cria instância do csvParse com parâmetro padrão
    const parsers = csvParse({
      from_line: 2,
    });

    // ler as linhas q estiverem disponíveis
    const parseCSV = contactsReadStream.pipe(parsers);

    // criar arrays para armazenar as informações da importação para
    // posteriormente fazer a inserção de todos os dados de uma só vez no BD
    const transactions = [];
    const categories = [];

    parseCSV.on('data', async line => {
      const [title, type, value, category] = line.map(
        (cell: string) => cell.trim(), // remove os espaços na desestruturação
      );

      // verifica se estão chegando as informações, se não existir, não serão inseridas
      if (!title || !type || !value) return;

      categories.push(category);
      transactions.push({ title, type, value, category });
    });

    // como o parseCSV é assincrono, criamos uma nova Promise
    // verificar se o parseCSV emitiu o evento 'end' e dar o retorno esperado (resolve)
    await new Promise(resolve => parseCSV.on('end', resolve));

    return { categories, transactions };
  }
}

export default ImportTransactionsService;
