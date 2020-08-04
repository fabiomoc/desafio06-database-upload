import { getCustomRepository, getRepository, In } from 'typeorm';
import csvParse from 'csv-parse';
import fs from 'fs';

import Transaction from '../models/Transaction';
import Category from '../models/Category';

import TransactionsRepository from '../repositories/TransactionsRepository';

interface CSVTransaction {
  title: string;
  type: 'income' | 'outcome';
  value: number;
  category: string;
}

class ImportTransactionsService {
  async execute(filePath: string): Promise<Transaction[]> {
    const transactionsRepository = getCustomRepository(TransactionsRepository);
    const categoriesRepository = getRepository(Category);

    const contactsReadStream = fs.createReadStream(filePath); // lendo os arquivos

    // cria instância do csvParse com parâmetro padrão
    const parsers = csvParse({
      from_line: 2,
    });

    // ler as linhas q estiverem disponíveis
    const parseCSV = contactsReadStream.pipe(parsers);

    // criar arrays para armazenar as informações da importação para
    // posteriormente fazer a inserção de todos os dados de uma só vez no BD
    const transactions: CSVTransaction[] = [];
    const categories: string[] = [];

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

    // procurar pelas categorias existentes no BD
    const existentCategories = await categoriesRepository.find({
      where: {
        title: In(categories), // verifica se as categorias dentro do array está no BD
      },
    });

    // retornar somente os títulos da categorias existentes
    const existentCategoriesTitles = existentCategories.map(
      (category: Category) => category.title,
    );

    // filtrar categorias q não existem
    const addCategoryTitles = categories
      .filter(category => !existentCategoriesTitles.includes(category)) // retorna todas q não forem a categoria encontrada
      .filter((value, index, self) => self.indexOf(value) === index); // self é o array de categories. Vai buscar o index onde o value seja igual e vai retirar pelo filter

    // adicionar categorias q não existem no BD
    const newCategories = categoriesRepository.create(
      // o create vai ter como retorno todas as categorias em forma de objeto
      addCategoryTitles.map(title => ({
        title, // title: title
      })),
    );

    // salvar todas as novas categorias no BD
    await categoriesRepository.save(newCategories);

    // todas as categorias
    const finalCategories = [...newCategories, ...existentCategories];

    // criar transações
    const createdTransactions = transactionsRepository.create(
      // para cada transaction retorna um objeto
      transactions.map(transaction => ({
        title: transaction.title,
        type: transaction.type,
        value: transaction.value,
        category: finalCategories.find(
          category => category.title === transaction.category,
        ),
      })),
    );

    // salva a transação no BD
    await transactionsRepository.save(createdTransactions);

    // exclui o arquivo
    await fs.promises.unlink(filePath);

    return createdTransactions;
  }
}

export default ImportTransactionsService;
