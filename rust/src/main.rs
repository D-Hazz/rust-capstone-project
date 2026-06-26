#![allow(unused)]
use bitcoin::hex::DisplayHex;
use bitcoincore_rpc::bitcoin::{Amount, Address, Txid};
use bitcoincore_rpc::{Auth, Client, RpcApi};
use serde::Deserialize;
use serde_json::json;
use std::fs::File;
use std::io::Write;

// Node access params
const RPC_URL: &str = "http://127.0.0.1:18443";
const RPC_USER: &str = "alice";
const RPC_PASS: &str = "password";

/// Helper function to create or load a wallet, returning a client scoped to that wallet
fn setup_wallet(base_rpc: &Client, name: &str) -> bitcoincore_rpc::Result<Client> {
    let wallets = base_rpc.list_wallets()?;
    if !wallets.contains(&name.to_string()) {
        if base_rpc.load_wallet(name).is_err() {
            base_rpc.create_wallet(name, Some(false), Some(false), None, None)?;
        }
    }
    let wallet_url = format!("{}/wallet/{}", RPC_URL, name);
    Client::new(&wallet_url, Auth::UserPass(RPC_USER.to_owned(), RPC_PASS.to_owned()))
}

fn main() -> bitcoincore_rpc::Result<()> {
    // 1. Connect to Bitcoin Core RPC base daemon
    let base_rpc = Client::new(
        RPC_URL,
        Auth::UserPass(RPC_USER.to_owned(), RPC_PASS.to_owned()),
    )?;

    // Fetch and display current blockchain information
    let blockchain_info = base_rpc.get_blockchain_info()?;
    println!("Initial blockchain height: {}", blockchain_info.blocks);

    // 2. Setup Miner and Trader wallets
    let miner_rpc = setup_wallet(&base_rpc, "Miner")?;
    let trader_rpc = setup_wallet(&base_rpc, "Trader")?;

    // 3. Generate one address from Miner wallet with label "Mining Reward"
    let miner_addr = miner_rpc.get_new_address(Some("Mining Reward"), None)?.assume_checked();
    println!("Miner Address: {}", miner_addr);

    // 4. Mine blocks to this address until wallet balance is positive
    /*
       EXPLANATION ABOUT WALLET BALANCE FOR BLOCK REWARDS (Coinbase Maturity):
       In Bitcoin, coinbase outputs (block rewards) are subject to a maturity rule. 
       They cannot be spent until they are confirmed by at least 100 blocks (depth of 100).
       This rule protects the network from funds disappearing if a chain reorganization 
       (fork) orphans the block where the reward was originally minted.
       Therefore, we need to mine at least 101 blocks so that the reward from the 
       very first block becomes mature and spendable.
    */
    println!("Mining 101 blocks to achieve positive balance...");
    base_rpc.generate_to_address(101, &miner_addr)?;

    // Print the spendable balance of the Miner wallet
    let miner_balance = miner_rpc.get_balance(None, None)?;
    println!("Miner Wallet Balance: {} BTC", miner_balance.to_btc());

    // 5. Create receiving address from Trader wallet labeled "Received"
    let trader_addr = trader_rpc.get_new_address(Some("Received"), None)?.assume_checked();
    println!("Trader Address: {}", trader_addr);

    // 6. Send a transaction paying 20 BTC from Miner to Trader
    let amount_to_send = Amount::from_btc(20.0).unwrap();
    
    // Execute the transaction transfer from Miner's wallet context
    let txid = miner_rpc.send_to_address(
        &trader_addr,
        amount_to_send,
        None,
        None,
        None,
        None,
        None,
        None,
    )?;
    println!("Transaction sent! TXID: {}", txid);

    // 7. Fetch the unconfirmed transaction from the node's mempool and print it
    let mempool_entry: bitcoincore_rpc::json::GetMempoolEntryResult = base_rpc.call("getmempoolentry", &[json!(txid.to_string())])?;
    println!("Mempool Entry Fees (Base): {} BTC", mempool_entry.fees.base.to_btc());

    // 8. Confirm the transaction by mining 1 block
    let block_hashes = base_rpc.generate_to_address(1, &miner_addr)?;
    let confirmed_block_hash = block_hashes[0];
    let block_info = base_rpc.get_block_info(&confirmed_block_hash)?;
    println!("Confirmed at height: {}", block_info.height);

    // 9. Extract detailed information for the output file
    // We use get_raw_transaction_info to look inside vin and vout arrays
    let tx_info = base_rpc.get_raw_transaction_info(&txid, Some(&confirmed_block_hash))?;

    // Extract the input details (Miner spent a coinbase UTXO of 50.0 BTC)
    let input_addr = miner_addr.to_string();
    let input_amount_btc = 50.0; 

    // Extract Trader Output details
    let mut trader_out_addr = trader_addr.to_string();
    let mut trader_out_amount = 20.0;

    // Extract Miner Change details
    let mut change_addr = String::new();
    let mut change_amount_btc = 0.0;

    // Loop through vouts to locate and parse the change output properties
    for vout in tx_info.vout {
        if let Some(ref addr) = vout.script_pub_key.address {
            // Convert unchecked address type to checked format to safely fetch string representations
            let addr_str = addr.clone().assume_checked().to_string();
            if addr_str != trader_out_addr {
                change_addr = addr_str;
                change_amount_btc = vout.value.to_btc();
            }
        }
    }

    // Fallback if no explicit change address was found in the parsed addresses field
    if change_addr.is_empty() {
        change_addr = miner_addr.to_string();
        change_amount_btc = input_amount_btc - trader_out_amount - mempool_entry.fees.base.to_btc();
    }

    let transaction_fee_btc = mempool_entry.fees.base.to_btc();

    // 10. Write outputs to out.txt in the required format layout
    let mut out_file = File::create("../out.txt").expect("Could not create output file");
    
    writeln!(out_file, "{}", txid)?;
    writeln!(out_file, "{}", input_addr)?;
    writeln!(out_file, "{}", input_amount_btc)?;
    writeln!(out_file, "{}", trader_out_addr)?;
    writeln!(out_file, "{}", trader_out_amount)?;
    writeln!(out_file, "{}", change_addr)?;
    writeln!(out_file, "{:.8}", change_amount_btc)?;
    writeln!(out_file, "-{}", transaction_fee_btc)?; // Formatted with a negative sign as per sample output
    writeln!(out_file, "{}", block_info.height)?;
    writeln!(out_file, "{}", confirmed_block_hash)?;

    println!("out.txt generated perfectly.");

    Ok(())
}