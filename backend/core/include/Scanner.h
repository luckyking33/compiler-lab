#ifndef SCANNER_H
#define SCANNER_H

#include <cstddef>
#include <string>
#include <unordered_map>

// Token type enumeration.
// Keywords are modeled as dedicated enum values for later parsing stages.
enum class TokenType {
    INT,
    FLOAT,
    VOID,
    IF,
    ELSE,
    WHILE,
    RETURN,
    INPUT,
    PRINT,

    ID,
    NUM,
    FLO,

    ADD,
    SUB,
    MUL,
    DIV,
    ROP,
    BOP,
    ASG,
    AAS,
    AAA,

    LPA,
    RPA,
    LBK,
    RBK,
    LBR,
    RBR,
    CMA,
    SCO,

    END_OF_FILE,
    INVALID
};

// A token stores only its type and raw lexeme text.
struct Token {
    TokenType type;
    std::string value;

    Token(TokenType tokenType = TokenType::INVALID, const std::string& tokenValue = "");
};

std::string tokenTypeToString(TokenType type);
bool isKeywordToken(TokenType type);

class Scanner {
public:
    Scanner();

    bool loadFromFile(const std::string& filename);
    void loadFromString(const std::string& source);
    Token getNextToken();
    void reset();
    bool hasMoreTokens() const;

private:
    enum class State {
        START,
        IDENTIFIER,
        SIGN,
        INTEGER,
        LEADING_DOT_FLOAT,
        FRACTION
    };

    char peek() const;
    char peekNext() const;
    char advance();
    bool isAtEnd() const;
    void skipWhitespace();
    bool isLetter(char ch) const;
    bool isDigit(char ch) const;
    bool isLetterOrDigit(char ch) const;
    bool canStartSignedNumber() const;
    void rememberToken(const Token& token);
    Token makeToken(TokenType type, const std::string& value);
    Token makeInvalidToken(const std::string& value);

    std::string source_;
    std::size_t pos_;
    std::size_t length_;
    std::unordered_map<std::string, TokenType> keywords_;
    TokenType lastTokenType_;
    bool hasLastToken_;
};

#endif  // SCANNER_H
