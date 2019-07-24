import React from './react';

class Counter extends React.Component {
    constructor(props) {
        super(props);
        this.state = {odd: true}
    }

    componentWillMount() {
        console.log("Counter componentWillMount")
    }

    componentDidMount() {
        console.log("Counter componentDidMount")
        setTimeout(()=>{
            this.setState({odd:!this.state.odd});
        },1000);
    }

    shouldComponentUpdate(nextSate,nextProps) {
        return true;
    }

    componentDidUpdate() {
        console.log("组件更新完成");
    }

    render() {
        if(this.state.odd){
            return React.createElement('ul',{className:'old',style:{backgroundColor:"red"}},
                React.createElement('li',{key:'A'},'A'),
                React.createElement('li',{key:'B'},'B'),
                React.createElement('li',{key:'C'},'C'),
                React.createElement('li',{key:'D'},'D'),
            );
        }
        return React.createElement('ul',{id:'new',style: {fontSize:"20px"}},
            React.createElement('li',{key:'A'},'A1'),
            React.createElement('li',{key:'C'},'C1'),
            React.createElement('li',{key:'B'},'B1'),
            React.createElement('li',{key:'E'},'E'),
            React.createElement('li',{key:'F'},'F')
        );
    }
}

let element = React.createElement(Counter);
React.render(element,"#root");
