/*****
 License
 --------------
 Copyright © 2017 Bill & Melinda Gates Foundation
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
import {ISettlementModelClient} from "@mojaloop/settlements-bc-public-types-lib";

export class SettlementModelClient implements ISettlementModelClient {
	private _settlementsApiUrl:string;

	constructor(settlementsApiUrl:string){
		this._settlementsApiUrl = settlementsApiUrl;
	}

	async init(): Promise<void> {
		// TODO fetch the available models from the settlements api
		return Promise.resolve();
	}

	async destroy(): Promise<void> {
		return Promise.resolve();
	}

	getSettlementModel(
		transferAmount: bigint,
		payerCurrency: string | null,
		payeeCurrency: string | null,
		extensionList: { key: string; value: string; }[]
	): Promise<string> {
		// TODO decide model based on conditions - use models from initialization step (sourced from settlements' api)

		return Promise.resolve("DEFAULT");
	}
}

/*
export function obtainSettlementModelFrom(
	transferAmount: bigint,
	debitAccountCurrency: string | null,
	creditAccountCurrency: string | null,
	extensionList: { key: string; value: string;}[]
) : Promise<string> {
	if (debitAccountCurrency === null || creditAccountCurrency===null)
		return Promise.resolve('DEFAULT');
	if (debitAccountCurrency !== creditAccountCurrency) {
		return Promise.resolve('FX');
	} else
		return Promise.resolve('DEFAULT');

	// TODO we need to unpack REMITTANCE
}
*/
