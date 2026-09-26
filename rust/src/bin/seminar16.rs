use bitcoincore_rpc::bitcoin::{Address, Amount};
use bitcoincore_rpc::json::CreateRawTransactionInput;
use bitcoincore_rpc::{Auth, Client, RpcApi};
use std::collections::HashMap;

const RPC_URL: &str = "http://127.0.0.1:18443";
const RPC_USER: &str = "alice";
const RPC_PASS: &str = "password";

fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("=== SÉMINAIRE SOCRATIQUE #16 : TRANSACTION BITCOIN MANUELLE ===");

    // 1. Connexion de base au nœud Regtest
    let base_rpc = Client::new(
        RPC_URL,
        Auth::UserPass(RPC_USER.to_owned(), RPC_PASS.to_owned()),
    )?;

    // Helper pour charger ou créer automatiquement les wallets
    let load_or_create_wallet = |wallet_name: &str| -> Result<Client, Box<dyn std::error::Error>> {
        let loaded = base_rpc.list_wallets()?;
        if !loaded.contains(&wallet_name.to_string()) {
            if base_rpc.load_wallet(wallet_name).is_err() {
                base_rpc.create_wallet(wallet_name, None, None, None, None)?;
            }
        }
        Ok(Client::new(
            &format!("{}/wallet/{}", RPC_URL, wallet_name),
            Auth::UserPass(RPC_USER.to_owned(), RPC_PASS.to_owned()),
        )?)
    };

    let miner_rpc = load_or_create_wallet("Miner")?;
    let trader_rpc = load_or_create_wallet("Trader")?;

    // --- S'ASSURER QUE LE MINER A DES FONDS MATURES ---
    // Les récompenses de minage nécessitent 100 confirmations avant d'être dépensables.
    let miner_check_addr = miner_rpc.get_new_address(Some("Mining Initial"), None)?.assume_checked();
    miner_rpc.generate_to_address(101, &miner_check_addr)?;

    // --- 14h20 - PRÉPARATION ET INSPECTION DES UTXOs ---
    println!("\n[1] Inspection des UTXOs disponibles (Miner)...");
    let unspent_list = miner_rpc.list_unspent(None, None, None, None, None)?;

    if unspent_list.is_empty() {
        eprintln!("Aucun UTXO disponible !");
        return Ok(());
    }

    // Sélection du premier UTXO disponible
    let utxo = &unspent_list[0];
    println!("UTXO sélectionné :");
    println!("  TxID: {}", utxo.txid);
    println!("  Vout: {}", utxo.vout);
    println!("  Montant: {} BTC", utxo.amount.to_btc());

    // Définition de l'adresse de destination (Trader) et de change (Miner)
    let trader_addr: Address = trader_rpc
        .get_new_address(Some("Trader Destination"), None)?
        .assume_checked();
    let miner_change_addr: Address = miner_rpc
        .get_new_address(Some("Change Address"), None)?
        .assume_checked();

    // Calcul des montants et frais (Exemple: 10 BTC envoyés, 0.0001 BTC de frais)
    let send_amount = Amount::from_btc(10.0)?;
    let fee = Amount::from_btc(0.0001)?;
    let change_amount = utxo.amount - send_amount - fee;

    println!("\nPlan de distribution :");
    println!("  Destinataire (Trader) : {} BTC -> {}", send_amount.to_btc(), trader_addr);
    println!("  Rendu / Change (Miner): {} BTC -> {}", change_amount.to_btc(), miner_change_addr);
    println!("  Frais de réseau        : {} BTC", fee.to_btc());

    // --- 14h45 - ATELIER : CONSTRUCTION ET SIGNATURE ---
    println!("\n[2] Construction de la transaction brute (createrawtransaction)...");
    let inputs = vec![CreateRawTransactionInput {
        txid: utxo.txid,
        vout: utxo.vout,
        sequence: None,
    }];

    let mut outputs = HashMap::new();
    outputs.insert(trader_addr.to_string(), send_amount);
    outputs.insert(miner_change_addr.to_string(), change_amount);

    // Création de la transaction non signée
    let raw_tx = miner_rpc.create_raw_transaction(&inputs, &outputs, None, None)?;

    let raw_tx_hex = bitcoincore_rpc::bitcoin::consensus::encode::serialize_hex(&raw_tx);
    println!("Hex de la transaction non signée :\n{}", raw_tx_hex);

    println!("\nDécodage de la transaction non signée (decoderawtransaction)...");
    let decoded_tx = miner_rpc.decode_raw_transaction(&raw_tx, None)?;
    println!("  Nombre d'inputs  : {}", decoded_tx.vin.len());
    println!("  Nombre d'outputs : {}", decoded_tx.vout.len());

    println!("\nSignature cryptographique (signrawtransactionwithwallet)...");
    let signed_tx_result = miner_rpc.sign_raw_transaction_with_wallet(&raw_tx, None, None)?;

    if !signed_tx_result.complete {
        eprintln!("La signature de la transaction a échoué !");
        return Ok(());
    }

    let signed_raw_tx_hex = signed_tx_result.hex;
    println!("Transaction signée prête pour diffusion !");

    // --- 15h15 - ATELIER : DIFFUSION, MEMPOOL ET MINAGE ---
    println!("\n[3] Broadcast de la transaction (sendrawtransaction)...");
    let txid = miner_rpc.send_raw_transaction(&signed_raw_tx_hex)?;
    println!("Transaction diffusée ! TxID: {}", txid);

    println!("\nObservation dans le Mempool...");
    let mempool_entry = base_rpc.get_mempool_entry(&txid)?;
    println!(
        "  Statut Mempool: Présente (vsize: {}, frais: {:?})",
        mempool_entry.vsize, mempool_entry.fees.base
    );

    println!("\nMinage d'un bloc sur Regtest pour confirmation...");
    let mining_addr = miner_rpc.get_new_address(None, None)?.assume_checked();
    let blocks = miner_rpc.generate_to_address(1, &mining_addr)?;
    println!("  Bloc miné : {}", blocks[0]);

    println!("\nVérification finale après minage...");
    let confirmed_tx = miner_rpc.get_raw_transaction_info(&txid, None)?;
    println!("  Confirmations : {}", confirmed_tx.confirmations.unwrap_or(0));
    println!("  BlockHash     : {:?}", confirmed_tx.blockhash);

    println!("\n=== DÉMONSTRATION COMPLÉTÉE AVEC SUCCÈS ===");
    Ok(())
}