#!/bin/bash

# Slack Hands Bot Docker Run Script

# 色付きのログ出力用関数
log_info() {
    echo -e "\033[0;32m[INFO]\033[0m $1"
}

log_warn() {
    echo -e "\033[0;33m[WARN]\033[0m $1"
}

log_error() {
    echo -e "\033[0;31m[ERROR]\033[0m $1"
}

# 設定確認
check_env() {
    log_info "設定ファイルをチェックしています..."
    
    if [ ! -f ".env" ]; then
        log_error ".envファイルが見つかりません"
        log_info "セットアップを実行します: cp .env.example .env"
        cp .env.example .env
        log_warn ".envファイルにSlackトークンを設定してください"
        return 1
    fi
    
    if [ ! -f "config.json" ]; then
        log_error "config.jsonが見つかりません"
        log_info "セットアップを実行します: cp config.example.json config.json"
        cp config.example.json config.json
        log_warn "config.jsonを適切に設定してください"
        return 1
    fi
    
    log_info "設定ファイルが確認されました"
    return 0
}

# Dockerイメージをビルド
build_image() {
    log_info "Dockerイメージをビルドしています..."
    docker build -t slack-hands-bot .
    if [ $? -eq 0 ]; then
        log_info "Dockerイメージのビルドが完了しました"
    else
        log_error "Dockerイメージのビルドに失敗しました"
        exit 1
    fi
}

# コンテナを実行
run_container() {
    log_info "Slack Hands Botを起動しています..."
    
    # 既存のコンテナを停止・削除
    docker stop slack-hands-bot 2>/dev/null || true
    docker rm slack-hands-bot 2>/dev/null || true
    
    # 新しいコンテナを起動
    docker run -d \
        --name slack-hands-bot \
        --env-file .env \
        -v "$(pwd)/config.json:/app/config.json:ro" \
        --restart unless-stopped \
        slack-hands-bot
    
    if [ $? -eq 0 ]; then
        log_info "✅ Slack Hands Botが正常に起動しました"
        log_info "ログを確認: docker logs -f slack-hands-bot"
        log_info "停止する場合: docker stop slack-hands-bot"
    else
        log_error "❌ コンテナの起動に失敗しました"
        exit 1
    fi
}

# ログ表示
show_logs() {
    log_info "コンテナのログを表示しています..."
    docker logs -f slack-hands-bot
}

# ヘルプ表示
show_help() {
    echo "Slack Hands Bot Docker Runner"
    echo ""
    echo "使用方法:"
    echo "  ./run.sh [command]"
    echo ""
    echo "コマンド:"
    echo "  start    - ビルドして起動（デフォルト）"
    echo "  build    - Dockerイメージをビルドのみ"
    echo "  logs     - ログを表示"
    echo "  stop     - コンテナを停止"
    echo "  restart  - コンテナを再起動"
    echo "  status   - コンテナの状態を確認"
    echo "  help     - このヘルプを表示"
    echo ""
}

# メイン処理
case "${1:-start}" in
    "start")
        check_env
        if [ $? -eq 0 ]; then
            build_image
            run_container
        fi
        ;;
    "build")
        build_image
        ;;
    "logs")
        show_logs
        ;;
    "stop")
        log_info "Slack Hands Botを停止しています..."
        docker stop slack-hands-bot
        docker rm slack-hands-bot
        log_info "✅ Slack Hands Botが停止されました"
        ;;
    "restart")
        log_info "Slack Hands Botを再起動しています..."
        docker restart slack-hands-bot
        log_info "✅ Slack Hands Botが再起動されました"
        ;;
    "status")
        log_info "コンテナの状態:"
        docker ps -a --filter name=slack-hands-bot
        ;;
    "help")
        show_help
        ;;
    *)
        log_error "不明なコマンド: $1"
        show_help
        exit 1
        ;;
esac
