/*****
 License
 --------------
 Copyright © 2023 Bill & Melinda Gates Foundation
 The Mojaloop files are made available by the Bill & Melinda Gates Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

 Contributors
 --------------
 This is the official list (alphabetical ordering) of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Gates Foundation organization for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.

 * Coil
 * - Jason Bruwer <jason.bruwer@coil.com>

 --------------
 ******/

"use strict";

import {
	ISettlementConfigRepo,
	ISettlementBatchRepo,
	IParticipantAccountNotifier,
	ISettlementMatrixRequestRepo,
	SettlementsAggregate,
	InvalidTimestampError,
	InvalidBatchSettlementModelError,
	InvalidCurrencyCodeError,
	InvalidAmountError,
	InvalidTransferIdError,
	InvalidDebitAccountError,
	InvalidCreditAccountError,
	SettlementBatchNotFoundError,
	UnauthorizedError,
	InvalidBatchIdentifierError,
	InvalidIdError,
	InvalidCreditBalanceError,
	InvalidDebitBalanceError,
	InvalidParticipantAccountIdError,
	IAccountsBalancesAdapter,
	ISettlementBatchTransferRepo,
	SettlementMatrixAlreadyExistsError,
	SettlementMatrixIsClosedError,
	SettlementMatrixNotFoundError
} from "../../src/index";
import {ConsoleLogger, ILogger} from "@mojaloop/logging-bc-public-types-lib";
import {IAuditClient} from "@mojaloop/auditing-bc-public-types-lib";
import {randomUUID} from "crypto";
import {stringToBigint, bigintToString} from "../../src/converters";
import {IAuthorizationClient, CallSecurityContext} from "@mojaloop/security-bc-public-types-lib";
import {
	AuditClientMock,
	AuthorizationClientMock,
	SettlementConfigRepoMock,
	SettlementBatchRepoMock,
	ParticipantAccountNotifierMock,
	SettlementMatrixRequestRepoMock,
	AccountsBalancesAdapterMock,
	SettlementBatchTransferRepoMock,
	MessageProducerMock,
	MessageCache
} from "@mojaloop/settlements-bc-shared-mocks-lib";
import {
	ITransferDto

} from "@mojaloop/settlements-bc-public-types-lib";
import {SettlementConfig} from "../../src/types/settlement_config";
import {SettlementBatchTransfer} from "../../src/types/transfer";
import {IMessageProducer} from "@mojaloop/platform-shared-lib-messaging-types-lib/dist/index";

let authorizationClient: IAuthorizationClient;
let authorizationClientNoAuth: IAuthorizationClient;
let configRepo: ISettlementConfigRepo;
let settleBatchRepo: ISettlementBatchRepo;
let settleTransferRepo: ISettlementBatchTransferRepo;
let settleMatrixReqRepo: ISettlementMatrixRequestRepo;
let partNotifier: IParticipantAccountNotifier;
let abAdapter: IAccountsBalancesAdapter;
let msgCache: MessageCache;
let msgProducer: IMessageProducer;

describe("Settlements BC [Domain] - Unit Tests", () => {
	let aggregate : SettlementsAggregate;
	let aggregateNoAuth : SettlementsAggregate;//TODO Do one with no auth.
	let securityContext : CallSecurityContext;

	beforeAll(async () => {
		// cross Cutting:
		const logger: ILogger = new ConsoleLogger();
		authorizationClient = new AuthorizationClientMock(logger, true);
		authorizationClientNoAuth = new AuthorizationClientMock(logger, false);
		const auditingClient: IAuditClient = new AuditClientMock(logger);

		securityContext = {
			username: 'unit-test',
			clientId: 'client-id',
			rolesIds: ['settlement-role'],
			accessToken: 'bear-token'
		};

		// mock Repos:
		configRepo = new SettlementConfigRepoMock();
		settleBatchRepo = new SettlementBatchRepoMock();
		settleTransferRepo = new SettlementBatchTransferRepoMock();
		settleMatrixReqRepo = new SettlementMatrixRequestRepoMock();

		// adapters:
		partNotifier = new ParticipantAccountNotifierMock();
		abAdapter = new AccountsBalancesAdapterMock();

		// other:
		msgCache = new MessageCache();
		msgProducer = new MessageProducerMock(logger, msgCache);

		// aggregate:
		aggregate = new SettlementsAggregate(
			logger,
			authorizationClient,
			auditingClient,
			settleBatchRepo,
			settleTransferRepo,
			configRepo,
			settleMatrixReqRepo,
			partNotifier,
			abAdapter,
			msgProducer
		);
		/*aggregateNoAuth = new SettlementsAggregate(
			logger,
			authorizationClientNoAuth,
			auditingClient,
			settleBatchRepo,
			settleBatchAccRepo,
			partNotifier,
			settleTransferRepo,
			configRepo,
			settleMatrixReqRepo,
			abAdapter
		);*/
	});

	afterAll(async () => {
		// nothing for now.
	});

	test("create settlement transfer and ensure meta-data is present", async () => {
		const reqTransferDto: ITransferDto = {
			id: null,
			transferId: randomUUID(),
			payerFspId: randomUUID(),
			payeeFspId: randomUUID(),
			currencyCode: 'EUR',
			amount: '10000', //100 EURO
			timestamp: Date.now(),
			settlementModel: 'DEFAULT'
		};
		const batchId: string = await aggregate.handleTransfer(securityContext, reqTransferDto);
		expect(batchId).toBeDefined();

		// transfer:
		const batches = await aggregate.getSettlementBatchesByCriteria(
			securityContext,
			reqTransferDto.settlementModel,
			reqTransferDto.currencyCode,
			Date.now() - 30000,
			Date.now() + 30000);
		expect(batches).toBeDefined();
		expect(batches.length).toBeGreaterThan(0);
		expect(batches[0].id).toEqual(batchId);
		expect(batches[0].state).toEqual('OPEN');
		expect(batches[0].accounts.length).toEqual(2);

		// batch:
		const batchById = await aggregate.getSettlementBatch(securityContext, batchId);
		expect(batchById).toBeDefined();
		expect(batchById!.id).toEqual(batchId);
		expect(batchById!.timestamp).toBeGreaterThan(0);
		expect(batchById!.settlementModel).toEqual(reqTransferDto.settlementModel);
		expect(batchById!.currencyCode).toEqual(reqTransferDto.currencyCode);
		expect(batchById!.batchName).toEqual(batchId.substring(0, batchId.length - 4));
		expect(batchById!.batchSequence).toEqual(1);
		expect(batchById!.state).toEqual('OPEN');
		expect(batchById!.accounts).toBeDefined();
		expect(batchById!.accounts.length).toEqual(2);

		// accounts:
		const accDR = await abAdapter.getParticipantAccounts(reqTransferDto.payerFspId);
		expect(accDR).toBeDefined();
		expect(accDR.length).toEqual(1);
		expect(accDR[0]!.id).toBeDefined();
		expect(accDR[0]!.ownerId).toEqual(reqTransferDto.payerFspId);
		expect(accDR[0]!.state).toEqual('ACTIVE');
		expect(accDR[0]!.type).toEqual('SETTLEMENT');
		expect(accDR[0]!.currencyCode).toEqual(reqTransferDto.currencyCode);
		expect(accDR[0]!.pendingDebitBalance).toEqual('0');
		expect(accDR[0]!.postedDebitBalance).toEqual(reqTransferDto.amount);
		expect(accDR[0]!.postedCreditBalance).toEqual('0');
		expect(accDR[0]!.pendingCreditBalance).toEqual('0');
		expect(accDR[0]!.timestampLastJournalEntry).toBeDefined();
		expect(accDR[0]!.timestampLastJournalEntry).toBeGreaterThan(0);

		const accCR = await abAdapter.getParticipantAccounts(reqTransferDto.payeeFspId);
		expect(accCR).toBeDefined();
		expect(accCR.length).toEqual(1);
		expect(accCR[0]!.id).toBeDefined();
		expect(accCR[0]!.ownerId).toEqual(reqTransferDto.payeeFspId);
		expect(accCR[0]!.state).toEqual('ACTIVE');
		expect(accCR[0]!.type).toEqual('SETTLEMENT');
		expect(accCR[0]!.currencyCode).toEqual(reqTransferDto.currencyCode);
		expect(accCR[0]!.pendingDebitBalance).toEqual('0');
		expect(accCR[0]!.postedDebitBalance).toEqual('0');
		expect(accCR[0]!.postedCreditBalance).toEqual(reqTransferDto.amount);
		expect(accCR[0]!.pendingCreditBalance).toEqual('0');
		expect(accCR[0]!.timestampLastJournalEntry).toBeDefined();
		expect(accCR[0]!.timestampLastJournalEntry).toBeGreaterThan(0);

		// transfers (journal entries):
		const accDRTransfers = await abAdapter.getJournalEntriesByAccountId(accDR[0]!.id!);
		expect(accDRTransfers).toBeDefined();
		expect(accDRTransfers.length).toEqual(1);
		expect(accDRTransfers[0].id).toBeDefined();
		expect(accDRTransfers[0].ownerId).toBeDefined();
		expect(accDRTransfers[0].ownerId).toEqual(batchId);
		expect(accDRTransfers[0].currencyCode).toEqual(reqTransferDto.currencyCode);
		expect(accDRTransfers[0].amount).toEqual(reqTransferDto.amount);
		expect(accDRTransfers[0].pending).toEqual(false);
		expect(accDRTransfers[0].debitedAccountId).toEqual(accDR[0]!.id);
		expect(accDRTransfers[0].creditedAccountId).toEqual(accCR[0]!.id);
		expect(accDRTransfers[0].timestamp).toBeGreaterThan(0);

		// transfers (settlement link):
		// locate the transfer link in settlement and ensure they match up:
		const accDRTransferSttl = await settleTransferRepo.getBatchTransfersByBatchIds([batchId]);
		expect(accDRTransferSttl).toBeDefined();
		expect(accDRTransferSttl.length).toEqual(1);
		expect(accDRTransferSttl[0].transferId).toBeDefined();
		expect(accDRTransferSttl[0].transferTimestamp).toBeGreaterThan(0);
		expect(accDRTransferSttl[0].payerFspId).toEqual(reqTransferDto.payerFspId);
		expect(accDRTransferSttl[0].payeeFspId).toEqual(reqTransferDto.payeeFspId);
		expect(accDRTransferSttl[0].currencyCode).toEqual(reqTransferDto.currencyCode);
		expect(accDRTransferSttl[0].amount).toEqual(reqTransferDto.amount);
		expect(accDRTransferSttl[0].batchId).toEqual(batchId);
		expect(accDRTransferSttl[0].batchName).toEqual(batches[0].batchName);
		expect(accDRTransferSttl[0].journalEntryId).toEqual(accDRTransfers[0].id);
	});

	test("create settlement transfer and ensure batch allocation is correct based on settlement model", async () => {
		const debPartAccId = randomUUID();
		const credPartAccId = randomUUID();

		const txn1RspBatch1 = await aggregate.handleTransfer(securityContext, {
			id: null,
			transferId: randomUUID(),
			payerFspId: debPartAccId,
			payeeFspId: credPartAccId,
			currencyCode: 'EUR',
			amount: '100', // 1 EURO
			timestamp: Date.now(),
			settlementModel: 'DEF'
		});
		const txn2RspBatch1 = await aggregate.handleTransfer(securityContext, {
			id: null,
			transferId: randomUUID(),
			payerFspId: debPartAccId,
			payeeFspId: credPartAccId,
			currencyCode: 'EUR',
			amount: '500', // 5 EURO
			timestamp: Date.now(),
			settlementModel: 'DEF'
		});
		const txn3RspBatch1 = await aggregate.handleTransfer(securityContext, {
			id: null,
			transferId: randomUUID(),
			payerFspId: debPartAccId,
			payeeFspId: credPartAccId,
			currencyCode: 'EUR',
			amount: '300', // 3 EURO
			timestamp: Date.now(),
			settlementModel: 'DEF'
		});

		// now we have a new settlement model:
		const txn4RspBatch2 = await aggregate.handleTransfer(securityContext, {
			id: null,
			transferId: randomUUID(),
			payerFspId: debPartAccId,
			payeeFspId: credPartAccId,
			currencyCode: 'EUR',
			amount: '300', // 3 EURO
			timestamp: Date.now(),
			settlementModel: 'FRX'
		});

		// now we ensure that we have 1 batch for the first 3 transfers, and another batch for transfer nr 4:
		expect(txn1RspBatch1).toBeDefined();
		expect(txn2RspBatch1).toBeDefined();
		expect(txn3RspBatch1).toBeDefined();
		expect(txn4RspBatch2).toBeDefined();

		expect(txn1RspBatch1).toEqual(txn2RspBatch1);
		expect(txn1RspBatch1).toEqual(txn3RspBatch1);

		const batch1 = await aggregate.getSettlementBatch(securityContext, txn1RspBatch1);
		expect(batch1).toBeDefined();
		expect(batch1!.settlementModel).toEqual('DEF');
		expect(batch1!.id).toEqual(txn1RspBatch1);
		expect(batch1!.id).toEqual(txn2RspBatch1);
		expect(batch1!.id).toEqual(txn3RspBatch1);

		const batch2 = await aggregate.getSettlementBatch(securityContext, txn4RspBatch2);
		expect(batch2).toBeDefined();
		expect(batch2!.settlementModel).toEqual('FRX');
		expect(batch2!.id).toEqual(txn4RspBatch2);

		// Ensure we have one batch for model [DEFAULT]:
		const batchModelDef = await aggregate.getSettlementBatchesByCriteria(
			securityContext,
			batch1!.settlementModel,
			batch1!.currencyCode,
			Date.now() - 15000,
			Date.now()
		);
		expect(batchModelDef).toBeDefined();
		expect(batchModelDef.length).toEqual(1);

		// ensure we have one batch for model [FX]:
		const batchModelFx = await aggregate.getSettlementBatchesByCriteria(
			securityContext,
			batch2!.settlementModel,
			batch2!.currencyCode,
			Date.now() - 15000,
			Date.now()
		);
		expect(batchModelFx).toBeDefined();
		expect(batchModelFx.length).toEqual(1);
	});

	test("test exceptions/errors responses for create transfer (validations)", async () => {
		// Timestamp:
		try {
			await aggregate.handleTransfer(securityContext, {
				id: null,
				transferId: randomUUID(),
				payerFspId: randomUUID(),
				payeeFspId: randomUUID(),
				currencyCode: 'ZAR',
				amount: '1600', //100 EURO
				timestamp: 0,
				settlementModel: 'ERR'
			});
			fail('Expected to throw error!');
		} catch (err) {
			expect(err).toBeDefined();
			expect(err instanceof InvalidTimestampError).toEqual(true);
		}

		// Settlement Model:
		try {
			await aggregate.handleTransfer(securityContext, {
				id: null,
				transferId: randomUUID(),
				payerFspId: randomUUID(),
				payeeFspId: randomUUID(),
				currencyCode: 'ZAR',
				amount: '1600', //100 EURO
				timestamp: Date.now(),
				settlementModel: ''
			});
			fail('Expected to throw error!');
		} catch (err) {
			expect(err).toBeDefined();
			expect(err instanceof InvalidBatchSettlementModelError).toEqual(true);
		}

		// Currency Code:
		try {
			await aggregate.handleTransfer(securityContext, {
				id: null,
				transferId: randomUUID(),
				payerFspId: randomUUID(),
				payeeFspId: randomUUID(),
				currencyCode: '',
				amount: '1600', //100 EURO
				timestamp: Date.now(),
				settlementModel: 'ERR'
			});
			fail('Expected to throw error!');
		} catch (err) {
			expect(err).toBeDefined();
			expect(err instanceof InvalidCurrencyCodeError).toEqual(true);
		}

		// Amount:
		try {
			await aggregate.handleTransfer(securityContext, {
				id: null,
				transferId: randomUUID(),
				payerFspId: randomUUID(),
				payeeFspId: randomUUID(),
				currencyCode: 'ZAR',
				amount: '',
				timestamp: Date.now(),
				settlementModel: 'ERR'
			});
			fail('Expected to throw error!');
		} catch (err) {
			expect(err).toBeDefined();
			expect(err instanceof InvalidAmountError).toEqual(true);
		}

		// Transfer ID:
		try {
			await aggregate.handleTransfer(securityContext, {
				id: null,
				transferId: '',
				payerFspId: randomUUID(),
				payeeFspId: randomUUID(),
				currencyCode: 'ZAR',
				amount: '15000', //150 ZAR
				timestamp: Date.now(),
				settlementModel: 'ERR'
			});
			fail('Expected to throw error!');
		} catch (err) {
			expect(err).toBeDefined();
			expect(err instanceof InvalidTransferIdError).toEqual(true);
		}

		// Debit Account ID:
		try {
			await aggregate.handleTransfer(securityContext, {
				id: null,
				transferId: randomUUID(),
				payerFspId: '',
				payeeFspId: randomUUID(),
				currencyCode: 'ZAR',
				amount: '15000', //150 ZAR
				timestamp: Date.now(),
				settlementModel: 'ERR'
			});
			fail('Expected to throw error!');
		} catch (err :any) {
			expect(err).toBeDefined();
			expect(err instanceof InvalidIdError).toEqual(true);
			expect(err.message).toEqual('Invalid payerFspId in transfer');
		}

		// Credit Account ID:
		try {
			await aggregate.handleTransfer(securityContext, {
				id: null,
				transferId: randomUUID(),
				payerFspId: randomUUID(),
				payeeFspId: '',
				currencyCode: 'ZAR',
				amount: '15000', //150 ZAR
				timestamp: Date.now(),
				settlementModel: 'ERR'
			});
			fail('Expected to throw error!');
		} catch (err :any) {
			expect(err).toBeDefined();
			expect(err instanceof InvalidIdError).toEqual(true);
			expect(err.message).toEqual('Invalid payeeFspId in transfer');
		}

		// Invalid Currency ID (not mapped):
		try {
			await aggregate.handleTransfer(securityContext, {
				id: null,
				transferId: randomUUID(),
				payerFspId: randomUUID(),
				payeeFspId: randomUUID(),
				currencyCode: 'ZZZ',
				amount: '15000', //150 ZZZ
				timestamp: Date.now(),
				settlementModel: 'ERR'
			});
			fail('Expected to throw error!');
		} catch (err) {
			expect(err).toBeDefined();
			expect(err instanceof InvalidCurrencyCodeError).toEqual(true);
		}

		// Invalid Amount (non decimal):
		try {
			await aggregate.handleTransfer(securityContext, {
				id: null,
				transferId: randomUUID(),
				payerFspId: randomUUID(),
				payeeFspId: randomUUID(),
				currencyCode: 'ZAR',
				amount: 'GSDSSD', // Invalid
				timestamp: Date.now(),
				settlementModel: 'ERR'
			});
			fail('Expected to throw error!');
		} catch (err) {
			expect(err).toBeDefined();
			expect(err instanceof InvalidAmountError).toEqual(true);
		}

		// Invalid Amount (0):
		try {
			await aggregate.handleTransfer(securityContext, {
					id: null,
					transferId: randomUUID(),
					payerFspId: randomUUID(),
					payeeFspId: randomUUID(),
					currencyCode: 'ZAR',
					amount: '0', // Invalid
					timestamp: Date.now(),
					settlementModel: 'ERR'
				});
			fail('Expected to throw error!');
		} catch (err) {
			expect(err).toBeDefined();
			expect(err instanceof InvalidAmountError).toEqual(true);
		}
	});

	test("request and execute a settlement matrix", async () => {
		const reqTransferDto: ITransferDto = {
			id: null,
			transferId: randomUUID(),
			payerFspId: randomUUID(),
			payeeFspId: randomUUID(),
			currencyCode: 'EUR',
			amount: '10000', //100 EURO
			timestamp: Date.now(),
			settlementModel: 'FX'
		};
		const batchId: string = await aggregate.handleTransfer(securityContext, reqTransferDto);
		expect(batchId).toBeDefined();

		const dateTo = Date.now();
		const dateFrom = dateTo - 5000;
		const matrixId = await aggregate.createSettlementMatrix(
			securityContext,
			null, // matrix-id
			reqTransferDto.settlementModel,
			reqTransferDto.currencyCode,
			dateFrom,
			dateTo
		);
		expect(matrixId).toBeDefined();

		// not allowed to create matrix using the same id.
		try {
			await aggregate.createSettlementMatrix(
				securityContext,
				matrixId,
				reqTransferDto.settlementModel,
				reqTransferDto.currencyCode,
				dateFrom,
				dateTo
			);
			fail('Expected to throw error!');
		} catch (err: any) {
			expect(err).toBeDefined();
			expect(err instanceof SettlementMatrixAlreadyExistsError).toEqual(true);
			expect(err.message).toEqual('Matrix with the same id already exists');
		}

		// retrieve the matrix and ensure it is in idle:
		const matrix = await aggregate.getSettlementMatrix(securityContext, matrixId);
		expect(matrix).toBeDefined();
		expect(matrix!.id).toEqual(matrixId);
		expect(matrix!.updatedAt).toBeGreaterThan(0);
		expect(matrix!.createdAt).toBeGreaterThan(0);
		expect(matrix!.createdAt).toBeGreaterThan(0);
		expect(matrix!.dateFrom).toEqual(dateFrom);
		expect(matrix!.dateTo).toEqual(dateTo);
		expect(matrix!.currencyCode).toEqual(reqTransferDto.currencyCode);
		expect(matrix!.settlementModel).toEqual(reqTransferDto.settlementModel);
		expect(matrix!.state).toEqual('IDLE');
		expect(matrix!.batches.length).toEqual(1);
		expect(matrix!.participantBalances.length).toEqual(2);
		expect(matrix!.totalDebitBalance).toEqual(reqTransferDto.amount);
		expect(matrix!.totalCreditBalance).toEqual(reqTransferDto.amount);
		expect(matrix!.generationDurationSecs).toBeGreaterThan(-1);

		// close the matrix:
		await aggregate.closeSettlementMatrix(securityContext, matrixId);
		const matrixClosed = await aggregate.getSettlementMatrix(securityContext, matrixId);
		expect(matrixClosed).toBeDefined();
		expect(matrixClosed!.id).toEqual(matrixId);
		expect(matrixClosed!.state).toEqual('CLOSED');
	});

	test("ensure executed matrix cannot be executed again", async () => {
		const reqTransferDto: ITransferDto = {
			id: null,
			transferId: randomUUID(),
			payerFspId: randomUUID(),
			payeeFspId: randomUUID(),
			currencyCode: 'ZAR',
			amount: '1600', //16 ZAR
			timestamp: Date.now(),
			settlementModel: 'REMITTANCE'
		};
		await aggregate.handleTransfer(securityContext, reqTransferDto);

		// request a Settlement Matrix, which will be used to execute the matrix on.
		const matrixId = await aggregate.createSettlementMatrix(
			securityContext,
			null, // matrix-id
			reqTransferDto.settlementModel,
			reqTransferDto.currencyCode,
			Date.now() - 5000,
			Date.now()
		);
		expect(matrixId).toBeDefined();

		const matrix = await aggregate.getSettlementMatrix(securityContext, matrixId);
		expect(matrix).toBeDefined();
		expect(matrix!.id).toEqual(matrixId);
		expect(matrix!.state).toEqual('IDLE');

		// execute the matrix (occurs on close):
		await aggregate.closeSettlementMatrix(securityContext, matrixId);
		const matrixClosed = await aggregate.getSettlementMatrix(securityContext, matrixId);
		expect(matrixClosed).toBeDefined();
		expect(matrixClosed!.id).toEqual(matrixId);
		expect(matrixClosed!.state).toEqual('CLOSED');

		// ensure the 2nd execute generates an error (SettlementMatrixRequestClosedError):
		try {
			await aggregate.closeSettlementMatrix(securityContext, matrixId);
			fail('Expected to throw error!');
		} catch (err :any) {
			expect(err).toBeDefined();
			expect(err instanceof SettlementMatrixIsClosedError).toEqual(true);
			expect(err.message).toEqual('Cannot execute a closed matrix');
		}

		// ensure an invalid id generates an error (SettlementMatrixRequestClosedError):
		const invalidMatrixId = randomUUID();
		try {
			await aggregate.closeSettlementMatrix(securityContext, invalidMatrixId);
			fail('Expected to throw error!');
		} catch (err :any) {
			expect(err).toBeDefined();
			expect(err instanceof SettlementMatrixNotFoundError).toEqual(true);
			expect(err.message).toEqual(`Matrix with id: ${invalidMatrixId} not found`);
		}
	});

	test("ensure batch seq increments for batches within the same period", async () => {
		const reqTransferDto: ITransferDto = {
			id: null,
			transferId: randomUUID(),
			payerFspId: randomUUID(),
			payeeFspId: randomUUID(),
			currencyCode: 'ZAR',
			amount: '1200', //12 ZAR
			timestamp: Date.now(),
			settlementModel: 'SEQ_TEST'
		};
		const batchId = await aggregate.handleTransfer(securityContext, reqTransferDto);
		expect(batchId).toBeDefined();

		// Request a Settlement Matrix, which will be used to execute the matrix on.
		const matrixId = await aggregate.createSettlementMatrix(
			securityContext,
			null, //matrix-id
			reqTransferDto.settlementModel,
			reqTransferDto.currencyCode,
			Date.now() - 5000,
			Date.now()
		);
		expect(matrixId).toBeDefined();

		const matrix = await aggregate.getSettlementMatrix(securityContext, matrixId);
		expect(matrix).toBeDefined();
		expect(matrix!.id).toEqual(matrixId);
		expect(matrix!.state).toEqual('IDLE');

		// execute the matrix:
		await aggregate.closeSettlementMatrix(securityContext, matrixId);
		// ensure the batch has been closed:
		const matrixClosed = await aggregate.getSettlementMatrix(securityContext, matrixId);
		expect(matrixClosed).toBeDefined();
		expect(matrixClosed!.id).toEqual(matrixId);
		expect(matrixClosed!.state).toEqual('CLOSED');

		// create another Transfer:
		const newBatchId = await aggregate.handleTransfer(securityContext, reqTransferDto);
		expect(newBatchId).toBeDefined();
		expect(newBatchId === batchId).toEqual(false);

		// retrieve the Batch:
		const batches = await aggregate.getSettlementBatchesByCriteria(
			securityContext, 
			reqTransferDto.settlementModel,
			reqTransferDto.currencyCode,
			Date.now() - 15000,
			Date.now()
		);
		expect(batches).toBeDefined();
		// we expect at least 2 batches:
		expect(batches.length).toEqual(2);
		expect(batches[0].batchName).toEqual(batches[1].batchName);

		// ensure the Batch Sequence has a Seq of [2].
		for (const batch of batches) {
			if (batch.state === 'SETTLED') continue;
			// Ensure our seq was incremented:
			expect(batch.batchSequence).toEqual(2);
		}

		const batchesByName = await aggregate.getSettlementBatchesByName(securityContext, batches[0].batchName);
		expect(batchesByName).toBeDefined();
		expect(batches.length).toEqual(2);
		expect(batches[0].id === batches[1].id).toEqual(false);
	});

	test("batch accounts unique per batch and participant-id", async () => {
		const settleModel = 'PAR_ACC';
		const currency = 'ZAR';
		const payer = 'deb-acc';
		const payee = 'cred-acc';
		const batchId = await aggregate.handleTransfer(securityContext, {
			id: null,
			transferId: randomUUID(),
			payerFspId: payer,
			payeeFspId: payee,
			currencyCode: currency,
			amount: '123', //1.23 ZAR
			timestamp: Date.now(),
			settlementModel: settleModel
		});
		expect(batchId).toBeDefined();

		const matrixId = await aggregate.createSettlementMatrix(
			securityContext,
			null, //matrix-id
			settleModel,
			currency,
			Date.now() - 5000,
			Date.now(),
		);
		expect(matrixId).toBeDefined();

		await aggregate.closeSettlementMatrix(securityContext, matrixId);

		// New Transfer under a new batch but same participants:
		const batchId2 = await aggregate.handleTransfer(securityContext, {
			id: null,
			transferId: randomUUID(),
			payerFspId: payer,
			payeeFspId: payee,
			currencyCode: currency,
			amount: '123', //1.23 ZAR
			timestamp: Date.now(),
			settlementModel: settleModel
			},
		);
		expect(batchId2).toBeDefined();

		const partAccPayer = await abAdapter.getParticipantAccounts(payer);
		const partAccPayee = await abAdapter.getParticipantAccounts(payee);

		expect(partAccPayer).toBeDefined();
		expect(partAccPayer.length).toEqual(2);
		expect(partAccPayee).toBeDefined();
		expect(partAccPayee.length).toEqual(2);

		for (const accBatch1 of partAccPayer) {
			for (const accBatch2 of partAccPayee) {
				expect(accBatch1).toBeDefined();
				expect(accBatch2).toBeDefined();
				// Batch Accounts are not allowed to match, even if [ParticipantAccountId's] match:
				expect(accBatch1.id === accBatch2.id).toEqual(false);
			}
		}
	});

	test("matrix re-calculate logic", async () => {
		const settleModel = 'RE-CALC';
		const currency = 'ZAR';
		const batchId = await aggregate.handleTransfer(securityContext, {
			id: null,
			transferId: randomUUID(),
			payerFspId: randomUUID(),
			payeeFspId: randomUUID(),
			currencyCode: 'EUR',
			amount: '1000', //10 EURO
			timestamp: Date.now(),
			settlementModel: settleModel
		});
		expect(batchId).toBeDefined();

		const matrixId = await aggregate.createSettlementMatrix(
			securityContext,
			null, //matrix-id
			settleModel,
			currency,
			Date.now() - 5000,
			Date.now(),
		);
		expect(matrixId).toBeDefined();

		await aggregate.recalculateSettlementMatrix(securityContext, matrixId);
		const matrixIdle = await aggregate.getSettlementMatrix(securityContext, matrixId);
		expect(matrixIdle).toBeDefined();
		expect(matrixIdle!.id).toEqual(matrixId);
		expect(matrixIdle!.state).toEqual('IDLE');
		expect(matrixIdle!.participantBalances.length).toEqual(2);

		// 2nd transfer with new participants:
		await aggregate.handleTransfer(securityContext, {
			id: null,
			transferId: randomUUID(),
			payerFspId: randomUUID(),
			payeeFspId: randomUUID(),
			currencyCode: 'EUR',
			amount: '1100', //11 EURO
			timestamp: Date.now(),
			settlementModel: settleModel
		});
		await aggregate.recalculateSettlementMatrix(securityContext, matrixId);
		const matrixIdleUpdated = await aggregate.getSettlementMatrix(securityContext, matrixId);
		expect(matrixIdleUpdated).toBeDefined();
		expect(matrixIdleUpdated!.id).toEqual(matrixId);
		expect(matrixIdleUpdated!.state).toEqual('IDLE');
		expect(matrixIdleUpdated!.participantBalances.length).toEqual(4);
	});

	test("test exceptions/errors responses for lookups", async () => {

		
	});

	// :
	test("send a settlement matrix request again, to show that the results are different from a previous matrix", async () => {
		//TODO
	});

	test("dispute a batch", async () => {
		const reqTransferDto: ITransferDto = {
			id: null,
			transferId: randomUUID(),
			payerFspId: randomUUID(),
			payeeFspId: randomUUID(),
			currencyCode: 'EUR',
			amount: '10000', //100 EURO
			timestamp: Date.now(),
			settlementModel: 'DISPUTE-ME'
		};
		const batchId: string = await aggregate.handleTransfer(securityContext, reqTransferDto);
		expect(batchId).toBeDefined();

		// dispute the one and only batch:
		const matrixIdDisp = await aggregate.createDisputeSettlementMatrix(
			securityContext,
			null, // matrix-id
			[batchId]
		);
		expect(matrixIdDisp).toBeDefined();

		const matrixDisp = await aggregate.getSettlementMatrix(securityContext, matrixIdDisp);
		expect(matrixDisp).toBeDefined();
		expect(matrixDisp!.id).toEqual(matrixIdDisp);
		expect(matrixDisp!.state).toEqual('DISPUTED');
		expect(matrixDisp!.currencyCode).toEqual('');
		expect(matrixDisp!.settlementModel).toEqual('');

		const batchDisp = await aggregate.getSettlementBatch(securityContext, batchId);
		expect(batchDisp).toBeDefined();
		expect(batchDisp!.id).toEqual(batchId);
		expect(batchDisp!.state).toEqual('DISPUTED');

		// now let's create a matrix with the disputed batch:
		const matrixId = await aggregate.createSettlementMatrix(
			securityContext,
			null, //matrix-id
			reqTransferDto.settlementModel,
			reqTransferDto.currencyCode,
			Date.now() - 5000,
			Date.now(),
		);
		expect(matrixId).toBeDefined();
		const matrix = await aggregate.getSettlementMatrix(securityContext, matrixId);
		expect(matrix).toBeDefined();
		expect(matrix!.id).toEqual(matrixId);
		expect(matrix!.state).toEqual('IDLE');
		expect(matrix!.batches.length).toEqual(0);

		// remove the batch from dispute and re-calculate the matrix:
		const matrixIdUnDispute = await aggregate.createUnDisputeSettlementMatrix(
			securityContext,
			null, //matrix-id
			[batchId]
		);
		expect(matrixIdUnDispute).toBeDefined();
		const matrixUnDispute = await aggregate.getSettlementMatrix(securityContext, matrixIdUnDispute);
		expect(matrixUnDispute).toBeDefined();
		expect(matrixUnDispute!.state).toEqual('CLOSED');
		expect(matrixUnDispute!.currencyCode).toEqual('');
		expect(matrixUnDispute!.settlementModel).toEqual('');
		expect(matrixUnDispute!.batches.length).toEqual(1);

		const batchUnDispute = await aggregate.getSettlementBatch(securityContext, batchId);
		expect(batchUnDispute).toBeDefined();
		expect(batchUnDispute!.id).toEqual(batchId);
		expect(batchUnDispute!.state).toEqual('SETTLED');
	});
	
});
