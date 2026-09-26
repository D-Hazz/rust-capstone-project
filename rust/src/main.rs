#![allow(unused)]
use bitcoincore_rpc::bitcoin::Amount;
use bitcoincore_rpc::{Auth, Client, RpcApi};
use serde::Deserialize;
use serde_json::json;
use std::fs::File;
use std::io::Write;
use std::path::Path;

// Node access params (matches docker-compose default)
const RPC_URL: &str = "http://127.0.0.1:18443";
const RPC_USER: &str = "alice";
const RPC_PASS: &str = "password";

fn main() -> bitcoincore_rpc::Result<()> {
    // 1. Connect to Bitcoin Core RPC
    let base_rpc = Client::new(
        RPC_URL,
        Auth::UserPass(RPC_USER.to_owned(), RPC_PASS.to_owned()),
    )?;

    // 2. Helper to load or create wallets dynamically
    let load_or_create_wallet = |wallet_name: &str| -> bitcoincore_rpc::Result<Client> {
        let loaded = base_rpc.list_wallets()?;
        if !loaded.contains(&wallet_name.to_string()) {
            if base_rpc.load_wallet(wallet_name).is_err() {
                base_rpc.create_wallet(wallet_name, None, None, None, None)?;
            }
        }
        Client::new(
            &format!("{}/wallet/{}", RPC_URL, wallet_name),
            Auth::UserPass(RPC_USER.to_owned(), RPC_PASS.to_owned()),
        )
    };

    let miner_rpc = load_or_create_wallet("Miner")?;
    let trader_rpc = load_or_create_wallet("Trader")?;

    // 3. Generate spendable balances in Miner wallet
    // EXPLAINER COMMENT ON BLOCK REWARD MATURITY:
    // Coinbase outputs (block rewards) require 100 block confirmations before becoming spendable.
    // Mining 101 blocks ensures the reward from block #1 achieves 100 confirmations and matures.
    let miner_addr = miner_rpc.get_new_address(Some("Mining Reward"), None)?.assume_checked();
    miner_rpc.generate_to_address(101, &miner_addr)?;

    let miner_balance = miner_rpc.get_balance(None, None)?;
    println!("Miner Wallet Balance: {}", miner_balance);

    // 4. Create receiving address in Trader wallet
    let trader_addr = trader_rpc.get_new_address(Some("Received"), None)?.assume_checked();

    // 5. Send 20 BTC from Miner to Trader
    let amount_to_send = Amount::from_btc(20.0).expect("Invalid BTC amount");
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

    // 6. Inspect unconfirmed transaction in Mempool
    let mempool_entry = base_rpc.get_mempool_entry(&txid)?;
    println!("Unconfirmed Mempool Entry: {:?}", mempool_entry);

    // 7. Mine 1 block to confirm transaction
    let confirm_block_hashes = miner_rpc.generate_to_address(1, &miner_addr)?;
    let confirm_block_hash = confirm_block_hashes[0];
    let confirm_block_header = base_rpc.get_block_header_info(&confirm_block_hash)?;
    let confirm_block_height = confirm_block_header.height;

    // 8. Extract transaction output details
    let raw_tx = miner_rpc.get_raw_transaction(&txid, None)?;
    let decoded_tx = base_rpc.decode_raw_transaction(&raw_tx, None)?;

    // Fetch details of input spent from previous transaction
    let vin = &decoded_tx.vin[0];
    let prev_txid = vin.txid.unwrap();
    let prev_vout = vin.vout.unwrap();
    let prev_raw_tx = miner_rpc.get_raw_transaction(&prev_txid, None)?;
    let prev_decoded_tx = base_rpc.decode_raw_transaction(&prev_raw_tx, None)?;
    let prev_output = &prev_decoded_tx.vout[prev_vout as usize];

    let miner_input_addr = prev_output.script_pub_key.address.as_ref().unwrap().clone().assume_checked();
    let miner_input_amount = prev_output.value;

    let mut trader_output_addr = String::new();
    let mut trader_output_amount = Amount::ZERO;
    let mut miner_change_addr = String::new();
    let mut miner_change_amount = Amount::ZERO;

    for vout in &decoded_tx.vout {
        if let Some(addr) = &vout.script_pub_key.address {
            let addr_str = addr.clone().assume_checked().to_string();
            if addr_str == trader_addr.to_string() {
                trader_output_addr = addr_str;
                trader_output_amount = vout.value;
            } else {
                miner_change_addr = addr_str;
                miner_change_amount = vout.value;
            }
        }
    }

    let tx_fee = miner_input_amount - trader_output_amount - miner_change_amount;

    // 9. Write out.txt in root repository directory
    let out_path = if Path::new("../out.txt").exists() || Path::new("../package.json").exists() {
        "../out.txt"
    } else {
        "out.txt"
    };

    let mut out_file = File::create(out_path).expect("Failed to create out.txt");
    writeln!(out_file, "{}", txid)?;
    writeln!(out_file, "{}", miner_input_addr)?;
    writeln!(out_file, "{}", miner_input_amount.to_btc())?;
    writeln!(out_file, "{}", trader_output_addr)?;
    writeln!(out_file, "{}", trader_output_amount.to_btc())?;
    writeln!(out_file, "{}", miner_change_addr)?;
    writeln!(out_file, "{}", miner_change_amount.to_btc())?;
    writeln!(out_file, "-{}", tx_fee.to_btc())?;
    writeln!(out_file, "{}", confirm_block_height)?;
    writeln!(out_file, "{}", confirm_block_hash)?;

    println!("Completed successfully! out.txt generated at {}", out_path);
    Ok(())
}