class Component {
    constructor(type,props) {
        this.props = props;
    }

    setState(partialState) {
        this._currentUnit.update(null,partialState)
    }
}


export {
    Component
};

